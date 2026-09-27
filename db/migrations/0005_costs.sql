-- v1.2 原価・棚卸差異: wholesale prices per drink (effective from a JST date) and app settings.

create table drink_prices (
  id uuid primary key default gen_random_uuid(),
  drink_id uuid not null references drinks (id),
  -- Per bottle, excluding tax, in yen.
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  -- A JST calendar date. The price on day d is the row with the latest effective_from <= d.
  effective_from date not null,
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  constraint drink_prices_drink_effective_key unique (drink_id, effective_from)
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('tax_rate', '10'::jsonb),
  ('variance_qty_threshold', '5'::jsonb),
  ('variance_amount_threshold', '3000'::jsonb);

-- Same lockdown as 0004: the app connects as the owner (bypasses RLS); nobody else gets in.
alter table drink_prices enable row level security;
alter table app_settings enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table drink_prices, app_settings from anon, authenticated';
  end if;
end
$$;
