-- Applies a batch of stock movements atomically.
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
      (batch_id, line_no, type, drink_id, from_location_id, to_location_id, quantity, counted_quantity, note, staff_id)
    values
      (p_batch_id, v_line, v_type, v_drink, v_from, v_to, v_qty,
       case when v_type = 'adjust' then v_counted end,
       nullif(v_item ->> 'note', ''), p_staff_id);
  end loop;

  return query select * from stock_movements where batch_id = p_batch_id order by line_no;
end;
$$;

-- Marks a movement as voided (never deletes it) and records who did it.
create or replace function void_movement(p_movement_id uuid, p_actor_id uuid)
returns stock_movements
language plpgsql
as $$
declare
  v_m stock_movements;
  v_loc uuid;
begin
  select * into v_m from stock_movements where id = p_movement_id;
  if not found then
    raise exception 'movement_not_found';
  end if;

  for v_loc in
    select l.id from (values (v_m.from_location_id), (v_m.to_location_id)) as l(id)
    where l.id is not null order by l.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('stock:' || v_loc::text || ':' || v_m.drink_id::text, 0));
  end loop;

  update stock_movements
     set voided_at = now(), voided_by = p_actor_id
   where id = p_movement_id and voided_at is null
  returning * into v_m;
  if not found then
    raise exception 'already_voided';
  end if;

  insert into audit_logs (staff_id, action, target_type, target_id, details)
  values (p_actor_id, 'movement.void', 'stock_movement', p_movement_id,
          jsonb_build_object('type', v_m.type, 'drink_id', v_m.drink_id,
                             'quantity', v_m.quantity, 'recorded_by', v_m.staff_id));
  return v_m;
end;
$$;
