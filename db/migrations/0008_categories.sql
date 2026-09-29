-- 酒の種類（カテゴリ）。ボトルを種類ごとに分けて表示・集計するため。
-- カテゴリの追加・改名・廃止は管理画面（/admin/categories、管理者以上）から行う。
-- drinks.category_id は null 可 = 「未分類」。現場が新しいボトルを足したときは未分類で入り、
-- あとから分類できる。カテゴリを廃止しても、そこに属するボトルは未分類に落ちるだけで消えない。

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table drinks add column category_id uuid references categories (id) on delete set null;
create index drinks_category_idx on drinks (category_id);

insert into categories (name, sort_order) values
  ('焼酎', 1),
  ('ウイスキー', 2),
  ('ブランデー', 3),
  ('シャンパン・スパークリング', 4),
  ('ワイン', 5),
  ('日本酒', 6),
  ('その他', 7);

-- 0004 と同じロックダウン: アプリは所有者として繋ぐので RLS は素通り、他は全部塞ぐ。
alter table categories enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table categories from anon, authenticated';
  end if;
end
$$;
