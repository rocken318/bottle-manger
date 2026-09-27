-- 破損・廃棄: a new movement type that takes bottles out of a location like a sale, with a reason
-- (breakage / tasting / expired / other). Kept apart from sales and stocktake differences so the
-- cost report can show it as its own 廃棄額.
alter table stock_movements add column reason text;

alter table stock_movements drop constraint stock_movements_type_check;
alter table stock_movements add constraint stock_movements_type_check
  check (type in ('receive', 'sale', 'transfer', 'adjust', 'dispose'));

alter table stock_movements drop constraint movement_shape;
alter table stock_movements add constraint movement_shape check (
  (type = 'receive' and from_location_id is null and to_location_id is not null
    and quantity >= 1 and counted_quantity is null and reason is null)
  or (type = 'sale' and from_location_id is not null and to_location_id is null
    and quantity >= 1 and counted_quantity is null and reason is null)
  or (type = 'transfer' and from_location_id is not null and to_location_id is not null
    and from_location_id <> to_location_id and quantity >= 1 and counted_quantity is null and reason is null)
  or (type = 'adjust' and from_location_id is null and to_location_id is not null
    and counted_quantity is not null and counted_quantity >= 0 and reason is null)
  or (type = 'dispose' and from_location_id is not null and to_location_id is null
    and quantity >= 1 and counted_quantity is null
    and reason is not null and reason in ('breakage', 'tasting', 'expired', 'other'))
);

-- Applies a batch of stock movements atomically (0007: also stores the dispose reason).
-- p_batch_id doubles as an idempotency key: re-sending the same batch returns the existing rows.
create or replace function apply_movements(p_batch_id uuid, p_staff_id uuid, p_items jsonb)
returns setof stock_movements
language plpgsql
as $$
declare
  v_item jsonb;
  v_line bigint;
  v_row record;
  v_pair record;
  v_type text;
  v_drink uuid;
  v_from uuid;
  v_to uuid;
  v_qty integer;
  v_counted integer;
  v_current integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('batch:' || p_batch_id::text, 0));

  if exists (select 1 from stock_movements where batch_id = p_batch_id) then
    return query select * from stock_movements where batch_id = p_batch_id order by line_no;
    return;
  end if;

  -- Lock every (location, drink) pair in a stable order so that concurrent
  -- batches cannot interleave with a stocktake and cannot deadlock.
  for v_pair in
    select distinct s.loc, s.drink
    from (
      select (e.i ->> 'from_location_id')::uuid as loc, (e.i ->> 'drink_id')::uuid as drink
      from jsonb_array_elements(p_items) as e(i)
      union all
      select (e.i ->> 'to_location_id')::uuid, (e.i ->> 'drink_id')::uuid
      from jsonb_array_elements(p_items) as e(i)
    ) as s
    where s.loc is not null
    order by s.loc, s.drink
  loop
    perform pg_advisory_xact_lock(hashtextextended('stock:' || v_pair.loc::text || ':' || v_pair.drink::text, 0));
  end loop;

  for v_row in select value, ordinality from jsonb_array_elements(p_items) with ordinality loop
    v_item := v_row.value;
    v_line := v_row.ordinality;
    v_type := v_item ->> 'type';
    v_drink := (v_item ->> 'drink_id')::uuid;
    v_from := (v_item ->> 'from_location_id')::uuid;
    v_to := (v_item ->> 'to_location_id')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;
    v_counted := (v_item ->> 'counted_quantity')::integer;

    if not exists (select 1 from drinks where id = v_drink and is_active) then
      raise exception 'inactive_drink';
    end if;
    if exists (
      select 1 from (values (v_from), (v_to)) as l(id)
      where l.id is not null
        and not exists (select 1 from locations where locations.id = l.id and locations.is_active)
    ) then
      raise exception 'inactive_location';
    end if;

    if v_type = 'adjust' then
      select coalesce(sum(quantity), 0) into v_current
      from stock_levels where location_id = v_to and drink_id = v_drink;
      v_qty := v_counted - v_current;
    end if;

    insert into stock_movements
      (batch_id, line_no, type, drink_id, from_location_id, to_location_id, quantity, counted_quantity, reason, note,
       staff_id)
    values
      (p_batch_id, v_line, v_type, v_drink, v_from, v_to, v_qty,
       case when v_type = 'adjust' then v_counted end,
       case when v_type = 'dispose' then v_item ->> 'reason' end,
       nullif(v_item ->> 'note', ''), p_staff_id);
  end loop;

  return query select * from stock_movements where batch_id = p_batch_id order by line_no;
end;
$$;

-- Photos of a batch (e.g. a broken bottle). Resized to JPEG on the phone before upload, so each
-- row is small; stored in the database to avoid another storage service. Private: served only to
-- logged-in staff through the app.
create table movement_photos (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) <= 1500000),
  created_by uuid not null references staff (id),
  created_at timestamptz not null default now()
);
create index movement_photos_batch_idx on movement_photos (batch_id);

-- Same lockdown as 0004: the app connects as the owner (bypasses RLS); nobody else gets in.
alter table movement_photos enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on movement_photos from anon, authenticated';
  end if;
end;
$$;
