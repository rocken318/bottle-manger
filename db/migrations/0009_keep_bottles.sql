-- お客様のキープボトル。お酒は drinks から選ぶが、名前は登録時点のものを drink_name にも残す
-- （あとで drinks 側の名前を直しても、キープの履歴は登録時の呼び名で読めるように）。
-- 期限は最終利用日から 180 日（日数は src/lib/keep.ts の定数）。自動で期限切れにはせず、
-- 画面から「期限切れにする」で status を dropped にする。

create table keep_bottles (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(btrim(customer_name)) between 1 and 50),
  drink_id uuid not null references drinks (id) on delete restrict,
  drink_name text not null,
  registered_on date not null,
  last_used_on date not null,
  status text not null default 'active' check (status in ('active', 'dropped')),
  dropped_on date,
  note text not null default '' check (length(note) <= 500),
  staff_id uuid references staff (id),
  created_at timestamptz not null default now(),
  constraint keep_last_used_after_registered check (last_used_on >= registered_on),
  constraint keep_dropped_on_matches_status check ((status = 'dropped') = (dropped_on is not null))
);

create index keep_bottles_status_last_used_idx on keep_bottles (status, last_used_on);

-- 0004 と同じロックダウン: アプリは所有者として繋ぐので RLS は素通り、他は全部塞ぐ。
alter table keep_bottles enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table keep_bottles from anon, authenticated';
  end if;
end
$$;
