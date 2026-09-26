-- The app connects as the table owner, which bypasses RLS.
-- Enabling RLS without policies blocks Supabase's public REST/GraphQL APIs completely.
alter table locations enable row level security;
alter table staff enable row level security;
alter table drinks enable row level security;
alter table stock_movements enable row level security;
alter table audit_logs enable row level security;
alter table schema_migrations enable row level security;

revoke execute on function apply_movements(uuid, uuid, jsonb) from public;
revoke execute on function void_movement(uuid, uuid) from public;

-- Supabase-only roles; skipped on plain Postgres / PGlite.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke execute on all functions in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
  end if;
end
$$;
