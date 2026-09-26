create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  role text not null check (role in ('admin', 'staff')),
  home_location_id uuid references locations (id),
  is_active boolean not null default true,
  failed_pin_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_active_name_key on staff (name) where is_active;

create table drinks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  units_per_case integer not null check (units_per_case >= 1),
  is_active boolean not null default true,
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  type text not null check (type in ('receive', 'sale', 'transfer', 'adjust')),
  drink_id uuid not null references drinks (id),
  from_location_id uuid references locations (id),
  to_location_id uuid references locations (id),
  quantity integer not null,
  counted_quantity integer,
  note text,
  staff_id uuid not null references staff (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references staff (id),
  constraint movement_shape check (
    (type = 'receive' and from_location_id is null and to_location_id is not null
      and quantity >= 1 and counted_quantity is null)
    or (type = 'sale' and from_location_id is not null and to_location_id is null
      and quantity >= 1 and counted_quantity is null)
    or (type = 'transfer' and from_location_id is not null and to_location_id is not null
      and from_location_id <> to_location_id and quantity >= 1 and counted_quantity is null)
    or (type = 'adjust' and from_location_id is null and to_location_id is not null
      and counted_quantity is not null and counted_quantity >= 0)
  ),
  constraint void_pair check ((voided_at is null) = (voided_by is null))
);
create index stock_movements_batch_idx on stock_movements (batch_id);
create index stock_movements_created_idx on stock_movements (created_at desc);
create index stock_movements_drink_idx on stock_movements (drink_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff (id),
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);

create view stock_levels with (security_invoker = true) as
select location_id, drink_id, sum(delta)::integer as quantity
from (
  select to_location_id as location_id, drink_id, quantity as delta
  from stock_movements
  where voided_at is null and to_location_id is not null
  union all
  select from_location_id as location_id, drink_id, -quantity as delta
  from stock_movements
  where voided_at is null and from_location_id is not null
) as deltas
group by location_id, drink_id;
