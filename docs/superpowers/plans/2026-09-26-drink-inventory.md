# ドリンク在庫管理システム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 拠点（事務所・Kingyo・B-club・暖家・En）のドリンク在庫を、スタッフがスマホから入荷・販売・移動・棚卸で管理し、すべての操作を記録する Web アプリを作る。

**Architecture:** Next.js（App Router）のサーバー側だけが Postgres（Supabase）に `DATABASE_URL` で直接接続する。在庫数は保存せず、`stock_movements`（在庫の動きの台帳）を集計するビュー `stock_levels` で求める。在庫を変える処理は PL/pgSQL 関数 `apply_movements` / `void_movement` の中で、アドバイザリロックを取ったうえで 1 トランザクションで行う。認証は名前選択 + PIN（bcrypt）で、署名付き JWT を httpOnly Cookie に保存する。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / postgres（porsager） / zod v4 / jose / bcryptjs / Vitest / PGlite（テスト用の組み込み Postgres） / Playwright / Supabase / Vercel

**Spec:** `docs/superpowers/specs/2026-09-26-drink-inventory-design.md`

---

## 前提と共通ルール

- 作業ディレクトリ: `C:\Users\rocke\OneDrive\ドキュメント\260926`（git 初期化済み）
- シェルは Git Bash を想定する。PowerShell でも npm コマンドは同じ
- Docker は無い。DB のテストはすべて PGlite（Node 上で動く Postgres）で行う
- DB アクセスはすべて `Db` インターフェース（`src/lib/db/types.ts`）を通す。本番は `postgres` ドライバ、テストは PGlite の実装を使う
- SQL の列は `as "camelCase"` で別名を付け、TypeScript の型に直接合わせる
- 数量はすべて「本」の整数。ケース換算は表示と入力のときだけ
- 画面の文言は日本語、コード（識別子・コメント）は英語
- 各タスクの最後にコミットする。コミットメッセージの末尾には必ず次の行を付ける:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## ファイル構成

```
package.json / tsconfig.json / next.config.ts / postcss.config.mjs
vitest.config.ts / playwright.config.ts / vercel.json
.gitignore / .gitattributes / .env.example
db/migrations/
  0001_schema.sql            テーブル・ビュー
  0002_stock_functions.sql   apply_movements / void_movement
  0003_seed_locations.sql    初期拠点 5 つ
  0004_lockdown.sql          RLS 有効化・権限の剥奪
scripts/
  migrate.ts                 DATABASE_URL にマイグレーションを適用
  create-admin.ts            最初の管理者を作成
  e2e-db.ts                  E2E 用の PGlite サーバーを起動
src/lib/
  types.ts                   ドメイン型
  db/types.ts                Db インターフェース
  db/postgres.ts             本番用 Db 実装
  db/pglite.ts               テスト用 Db 実装
  db/client.ts               getDb()（本番用シングルトン）
  db/migrate.ts              runMigrations()
  quantity.ts                ケース/本の換算と表示
  search.ts                  かな・全半角を区別しない検索
  csv.ts                     CSV 生成
  dates.ts                   JST の日時表示・日付範囲
  permissions.ts             canVoid()
  movementLabels.ts          履歴の表示文言
  movementFilter.ts          履歴の絞り込み条件の解析
  validation.ts              zod スキーマ
  errors.ts                  エラー → 日本語メッセージ
  formState.ts               フォームの戻り値の型
  auth/pin.ts                PIN のハッシュ化・照合
  auth/lockout.ts            ロックの判定
  auth/login.ts              attemptLogin()
  auth/session.ts            JWT の署名・検証
  auth/current.ts            getCurrentStaff / requireStaff / requireAdmin / Cookie 操作
  repo/audit.ts              操作ログ
  repo/staff.ts              スタッフ
  repo/drinks.ts             ドリンク
  repo/locations.ts          拠点
  repo/stock.ts              在庫の集計と登録
  repo/movements.ts          履歴と取り消し
src/app/
  layout.tsx / globals.css
  login/page.tsx / login/LoginForm.tsx / login/actions.ts
  (app)/layout.tsx / (app)/BottomNav.tsx
  (app)/page.tsx / (app)/StockView.tsx                      在庫
  (app)/entry/page.tsx / EntryForm.tsx / DrinkPicker.tsx / actions.ts   入力
  (app)/history/page.tsx / VoidButton.tsx / actions.ts      履歴
  (app)/drinks/page.tsx / DrinkCreateForm.tsx / actions.ts  ドリンク
  (app)/admin/page.tsx                                      管理トップ + 操作ログ
  (app)/admin/staff/page.tsx / StaffCreateForm.tsx / actions.ts
  (app)/admin/staff/[id]/page.tsx / StaffEditForms.tsx
  (app)/admin/locations/page.tsx / LocationForms.tsx / actions.ts
  api/export/movements/route.ts / api/export/stock/route.ts
tests/
  helpers/testDb.ts
  unit/*.test.ts             純粋関数
  db/*.test.ts               PGlite を使うテスト
e2e/
  inventory.spec.ts
```

---

### Task 1: プロジェクトの土台

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.gitattributes`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`（仮。Task 13 で削除）

- [ ] **Step 1: package.json を作る**

`package.json`:
```json
{
  "name": "drink-inventory",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "db:migrate": "tsx --env-file=.env.local scripts/migrate.ts",
    "db:create-admin": "tsx --env-file=.env.local scripts/create-admin.ts"
  }
}
```

- [ ] **Step 2: 依存パッケージを入れる**

```bash
npm install next@latest react@latest react-dom@latest postgres jose bcryptjs zod@^4
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss vitest vite-tsconfig-paths @electric-sql/pglite @electric-sql/pglite-socket tsx @playwright/test
```
Expected: エラーなく完了し、`package.json` に dependencies / devDependencies が追加される。

- [ ] **Step 3: 設定ファイルを作る**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
（`next build` が `jsx` などを書き換えることがある。書き換えられたらそのまま受け入れる）

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs`:
```js
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

`.gitignore`:
```
node_modules/
.next/
out/
next-env.d.ts
*.tsbuildinfo
.env*.local
.env
test-results/
playwright-report/
.vercel
```

`.gitattributes`:
```
* text=auto eol=lf
```

`.env.example`:
```
# Supabase > Project Settings > Database > Connection string > Transaction pooler (port 6543)
DATABASE_URL=postgresql://postgres.xxxxxxxx:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
# 32 文字以上のランダム文字列（例: openssl rand -base64 48）
SESSION_SECRET=change-me-to-a-random-string-of-at-least-32-chars
```

- [ ] **Step 4: 最小の画面を作る**

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'ドリンク在庫' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`（仮）:
```tsx
export default function Page() {
  return <main className="p-4">ドリンク在庫</main>;
}
```

- [ ] **Step 5: ビルドできることを確認する**

Run: `npm run build`
Expected: `✓ Compiled successfully`、終了コード 0

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Next.js + Tailwind + Vitest の土台を作成

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Db インターフェース・マイグレーション・スキーマ

**Files:**
- Create: `src/lib/db/types.ts`, `src/lib/db/pglite.ts`, `src/lib/db/postgres.ts`, `src/lib/db/client.ts`, `src/lib/db/migrate.ts`
- Create: `db/migrations/0001_schema.sql`, `db/migrations/0003_seed_locations.sql`
- Create: `tests/helpers/testDb.ts`
- Test: `tests/db/migrate.test.ts`

- [ ] **Step 1: Db インターフェースと実装を書く**

`src/lib/db/types.ts`:
```ts
export interface Db {
  /** Run one parameterized statement ($1, $2, ...) and return its rows. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters (used for migrations). */
  exec(text: string): Promise<void>;
  /** Run fn inside a transaction. Nested calls reuse the outer transaction. */
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}
```

`src/lib/db/pglite.ts`:
```ts
import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { Db } from './types';

function wrapTransaction(tx: Transaction): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      return (await tx.query<T>(text, params as never[])).rows;
    },
    async exec(text: string) {
      await tx.exec(text);
    },
    transaction: (fn) => fn(db),
  };
  return db;
}

export function wrapPglite(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params as never[])).rows;
    },
    async exec(text: string) {
      await pg.exec(text);
    },
    transaction: (fn) => pg.transaction((tx) => fn(wrapTransaction(tx))),
  };
}
```

`src/lib/db/postgres.ts`:
```ts
import postgres from 'postgres';
import type { Db } from './types';

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql, inTransaction: boolean): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return [...rows] as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R> {
      if (inTransaction) return fn(db);
      return (sql as postgres.Sql).begin((tx) => fn(wrap(tx, true))) as unknown as Promise<R>;
    },
  };
  return db;
}

export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 5),
  });
  return wrap(sql, false);
}
```

`src/lib/db/client.ts`:
```ts
import { createPostgresDb } from './postgres';
import type { Db } from './types';

const globalForDb = globalThis as unknown as { __drinkInventoryDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__drinkInventoryDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.__drinkInventoryDb = createPostgresDb(url);
  }
  return globalForDb.__drinkInventoryDb;
}
```

`src/lib/db/migrate.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './types';

export const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

/** Applies every not-yet-applied .sql file in name order. Returns the applied file names. */
export async function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sqlText);
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
```

- [ ] **Step 2: スキーマと初期拠点の SQL を書く**

`db/migrations/0001_schema.sql`:
```sql
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
```

`db/migrations/0003_seed_locations.sql`:
```sql
insert into locations (name, sort_order) values
  ('事務所', 1),
  ('Kingyo', 2),
  ('B-club', 3),
  ('暖家', 4),
  ('En', 5);
```
（0002 は Task 3 で作る。ファイル名順に適用されるので番号の欠けは問題ない）

- [ ] **Step 3: テスト用ヘルパーを書く**

`tests/helpers/testDb.ts`:
```ts
import { PGlite } from '@electric-sql/pglite';
import { wrapPglite } from '@/lib/db/pglite';
import { runMigrations } from '@/lib/db/migrate';
import type { Db } from '@/lib/db/types';

export async function createTestDb(): Promise<Db> {
  const db = wrapPglite(new PGlite());
  await runMigrations(db);
  return db;
}

export async function locationIdByName(db: Db, name: string): Promise<string> {
  const rows = await db.query<{ id: string }>('select id from locations where name = $1', [name]);
  if (!rows[0]) throw new Error(`location not found: ${name}`);
  return rows[0].id;
}

/** Inserts a staff row with a dummy PIN hash (use createStaff when a real PIN is needed). */
export async function insertStaff(db: Db, name = 'テスト', role: 'admin' | 'staff' = 'staff'): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into staff (name, pin_hash, role) values ($1, 'x', $2) returning id`,
    [name, role],
  );
  return rows[0].id;
}

export async function insertDrink(db: Db, name = 'コーラ', unitsPerCase = 24): Promise<string> {
  const rows = await db.query<{ id: string }>(
    'insert into drinks (name, units_per_case) values ($1, $2) returning id',
    [name, unitsPerCase],
  );
  return rows[0].id;
}
```

- [ ] **Step 4: 失敗するテストを書く**

`tests/db/migrate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/db/migrate';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

describe('migrations', () => {
  it('seeds the five initial locations in order', async () => {
    const db = await createTestDb();
    const rows = await db.query<{ name: string }>('select name from locations order by sort_order');
    expect(rows.map((r) => r.name)).toEqual(['事務所', 'Kingyo', 'B-club', '暖家', 'En']);
  });

  it('is idempotent', async () => {
    const db = await createTestDb();
    expect(await runMigrations(db)).toEqual([]);
  });

  it('rejects a sale without a source location', async () => {
    const db = await createTestDb();
    const staffId = await insertStaff(db);
    const drinkId = await insertDrink(db);
    const to = await locationIdByName(db, '事務所');
    await expect(
      db.query(
        `insert into stock_movements (batch_id, type, drink_id, to_location_id, quantity, staff_id)
         values (gen_random_uuid(), 'sale', $1, $2, 1, $3)`,
        [drinkId, to, staffId],
      ),
    ).rejects.toThrow(/movement_shape/);
  });

  it('computes stock_levels from non-voided movements', async () => {
    const db = await createTestDb();
    const staffId = await insertStaff(db);
    const drinkId = await insertDrink(db);
    const office = await locationIdByName(db, '事務所');
    await db.query(
      `insert into stock_movements (batch_id, type, drink_id, to_location_id, quantity, staff_id)
       values (gen_random_uuid(), 'receive', $1, $2, 10, $3)`,
      [drinkId, office, staffId],
    );
    await db.query(
      `insert into stock_movements (batch_id, type, drink_id, from_location_id, quantity, staff_id, voided_at, voided_by)
       values (gen_random_uuid(), 'sale', $1, $2, 4, $3, now(), $3)`,
      [drinkId, office, staffId],
    );
    const rows = await db.query<{ quantity: number }>(
      'select quantity from stock_levels where location_id = $1 and drink_id = $2',
      [office, drinkId],
    );
    expect(rows[0].quantity).toBe(10);
  });
});
```

- [ ] **Step 5: テストを実行して確認する**

Run: `npx vitest run tests/db/migrate.test.ts`
Expected: 4 件すべて PASS（ここまでで実装はそろっているので、失敗した場合は SQL かヘルパーを直す）

- [ ] **Step 6: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: DB 抽象化・マイグレーション・スキーマを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 在庫を変える DB 関数

**Files:**
- Create: `db/migrations/0002_stock_functions.sql`
- Test: `tests/db/stockFunctions.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/stockFunctions.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

type Item = {
  type: 'receive' | 'sale' | 'transfer' | 'adjust';
  drink_id: string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  quantity?: number | null;
  counted_quantity?: number | null;
  note?: string | null;
};

let db: Db;
let staffId: string;
let drinkId: string;
let office: string;
let kingyo: string;

async function apply(batchId: string, items: Item[]) {
  return db.query<{ id: string; quantity: number }>(
    'select id, quantity from apply_movements($1, $2, $3::jsonb)',
    [batchId, staffId, JSON.stringify(items)],
  );
}

async function stock(locationId: string, drink = drinkId): Promise<number> {
  const rows = await db.query<{ quantity: number }>(
    'select quantity from stock_levels where location_id = $1 and drink_id = $2',
    [locationId, drink],
  );
  return rows[0]?.quantity ?? 0;
}

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
  drinkId = await insertDrink(db);
  office = await locationIdByName(db, '事務所');
  kingyo = await locationIdByName(db, 'Kingyo');
});

describe('apply_movements', () => {
  it('handles receive, sale and transfer', async () => {
    await apply(crypto.randomUUID(), [{ type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 48 }]);
    await apply(crypto.randomUUID(), [
      { type: 'transfer', drink_id: drinkId, from_location_id: office, to_location_id: kingyo, quantity: 5 },
      { type: 'sale', drink_id: drinkId, from_location_id: kingyo, quantity: 2 },
    ]);
    expect(await stock(office)).toBe(43);
    expect(await stock(kingyo)).toBe(3);
  });

  it('turns a stocktake count into a difference', async () => {
    await apply(crypto.randomUUID(), [{ type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 }]);
    const rows = await apply(crypto.randomUUID(), [
      { type: 'adjust', drink_id: drinkId, to_location_id: office, counted_quantity: 7 },
    ]);
    expect(rows[0].quantity).toBe(-3);
    expect(await stock(office)).toBe(7);
  });

  it('is idempotent per batch id', async () => {
    const batchId = crypto.randomUUID();
    const item: Item = { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 };
    const first = await apply(batchId, [item]);
    const second = await apply(batchId, [item]);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(await stock(office)).toBe(10);
  });

  it('rolls back the whole batch when a drink is inactive', async () => {
    const retired = await insertDrink(db, '廃止ドリンク', 12);
    await db.query('update drinks set is_active = false where id = $1', [retired]);
    await expect(
      apply(crypto.randomUUID(), [
        { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 },
        { type: 'receive', drink_id: retired, to_location_id: office, quantity: 10 },
      ]),
    ).rejects.toThrow('inactive_drink');
    expect(await stock(office)).toBe(0);
  });

  it('rejects an inactive location', async () => {
    await db.query('update locations set is_active = false where id = $1', [kingyo]);
    await expect(
      apply(crypto.randomUUID(), [
        { type: 'transfer', drink_id: drinkId, from_location_id: office, to_location_id: kingyo, quantity: 1 },
      ]),
    ).rejects.toThrow('inactive_location');
  });

  it('stores the note and the staff member', async () => {
    const [row] = await apply(crypto.randomUUID(), [
      { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 1, note: '酒屋A' },
    ]);
    const [saved] = await db.query<{ note: string; staff_id: string }>(
      'select note, staff_id from stock_movements where id = $1',
      [row.id],
    );
    expect(saved).toEqual({ note: '酒屋A', staff_id: staffId });
  });
});

describe('void_movement', () => {
  it('removes the movement from stock and writes an audit log', async () => {
    const [row] = await apply(crypto.randomUUID(), [
      { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 },
    ]);
    await db.query('select void_movement($1, $2)', [row.id, staffId]);
    expect(await stock(office)).toBe(0);
    const logs = await db.query<{ action: string; target_id: string }>('select action, target_id from audit_logs');
    expect(logs).toEqual([{ action: 'movement.void', target_id: row.id }]);
  });

  it('refuses to void twice', async () => {
    const [row] = await apply(crypto.randomUUID(), [
      { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 },
    ]);
    await db.query('select void_movement($1, $2)', [row.id, staffId]);
    await expect(db.query('select void_movement($1, $2)', [row.id, staffId])).rejects.toThrow('already_voided');
  });

  it('reports a missing movement', async () => {
    await expect(db.query('select void_movement($1, $2)', [crypto.randomUUID(), staffId])).rejects.toThrow(
      'movement_not_found',
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/db/stockFunctions.test.ts`
Expected: FAIL（`function apply_movements(...) does not exist`）

- [ ] **Step 3: 関数を実装する**

`db/migrations/0002_stock_functions.sql`:
```sql
-- Applies a batch of stock movements atomically.
-- p_batch_id doubles as an idempotency key: re-sending the same batch returns the existing rows.
create or replace function apply_movements(p_batch_id uuid, p_staff_id uuid, p_items jsonb)
returns setof stock_movements
language plpgsql
as $$
declare
  v_item jsonb;
  v_pair record;
  v_type text;
  v_drink uuid;
  v_from uuid;
  v_to uuid;
  v_qty integer;
  v_counted integer;
  v_current integer;
begin
  perform pg_advisory_xact_lock(hashtext('batch:' || p_batch_id::text));

  if exists (select 1 from stock_movements where batch_id = p_batch_id) then
    return query select * from stock_movements where batch_id = p_batch_id order by created_at, id;
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
    perform pg_advisory_xact_lock(hashtext('stock:' || v_pair.loc::text || ':' || v_pair.drink::text));
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
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
      (batch_id, type, drink_id, from_location_id, to_location_id, quantity, counted_quantity, note, staff_id)
    values
      (p_batch_id, v_type, v_drink, v_from, v_to, v_qty,
       case when v_type = 'adjust' then v_counted end,
       nullif(v_item ->> 'note', ''), p_staff_id);
  end loop;

  return query select * from stock_movements where batch_id = p_batch_id order by created_at, id;
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
    perform pg_advisory_xact_lock(hashtext('stock:' || v_loc::text || ':' || v_m.drink_id::text));
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/db`
Expected: すべて PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 在庫を変える DB 関数 apply_movements / void_movement を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: DB のロックダウンと運用スクリプト

**Files:**
- Create: `db/migrations/0004_lockdown.sql`, `scripts/migrate.ts`
- Test: `tests/db/lockdown.test.ts`
（`scripts/create-admin.ts` は `createStaff` ができてから Task 9 で作る）

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/lockdown.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/testDb';

describe('lockdown', () => {
  it('enables row level security on every table', async () => {
    const db = await createTestDb();
    const rows = await db.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/db/lockdown.test.ts`
Expected: FAIL（テーブル名の一覧が返る）

- [ ] **Step 3: ロックダウン用の SQL を書く**

`db/migrations/0004_lockdown.sql`:
```sql
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
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated';
  end if;
end
$$;
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/db`
Expected: すべて PASS

- [ ] **Step 5: マイグレーション実行スクリプトを書く**

`scripts/migrate.ts`:
```ts
import { createPostgresDb } from '../src/lib/db/postgres';
import { runMigrations } from '../src/lib/db/migrate';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}

const ran = await runMigrations(createPostgresDb(url));
console.log(ran.length ? `applied: ${ran.join(', ')}` : 'already up to date');
process.exit(0);
```

- [ ] **Step 6: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: RLS によるロックダウンとマイグレーションスクリプトを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ドメイン型・数量・検索・日時

**Files:**
- Create: `src/lib/types.ts`, `src/lib/quantity.ts`, `src/lib/search.ts`, `src/lib/dates.ts`
- Test: `tests/unit/quantity.test.ts`, `tests/unit/search.test.ts`, `tests/unit/dates.test.ts`

- [ ] **Step 1: ドメイン型を書く**

`src/lib/types.ts`:
```ts
export type Role = 'admin' | 'staff';
export type MovementType = 'receive' | 'sale' | 'transfer' | 'adjust';

export interface Location {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  homeLocationId: string | null;
  isActive: boolean;
  failedPinAttempts: number;
  lockedUntil: Date | null;
}

export interface Drink {
  id: string;
  name: string;
  unitsPerCase: number;
  isActive: boolean;
  createdAt: Date;
}

export interface StockLevel {
  locationId: string;
  drinkId: string;
  quantity: number;
}

/** A validated movement ready to be sent to apply_movements. For 'adjust', quantity is ignored (computed in SQL). */
export interface MovementInput {
  type: MovementType;
  drinkId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  countedQuantity: number | null;
  note: string | null;
}

export interface Movement {
  id: string;
  batchId: string;
  type: MovementType;
  drinkId: string;
  drinkName: string;
  unitsPerCase: number;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  quantity: number;
  countedQuantity: number | null;
  note: string | null;
  staffId: string;
  staffName: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedByName: string | null;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/unit/quantity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatQuantity, splitCases, toBottles } from '@/lib/quantity';

describe('toBottles', () => {
  it('combines cases and bottles', () => {
    expect(toBottles(3, 5, 24)).toBe(77);
  });
});

describe('splitCases', () => {
  it('splits a total into cases and loose bottles', () => {
    expect(splitCases(77, 24)).toEqual({ cases: 3, bottles: 5 });
  });
});

describe('formatQuantity', () => {
  it('shows cases, bottles and total', () => {
    expect(formatQuantity(77, 24)).toBe('3ケース＋5本（計77本）');
  });
  it('omits bottles when the cases are full', () => {
    expect(formatQuantity(48, 24)).toBe('2ケース（計48本）');
  });
  it('shows only bottles below one case', () => {
    expect(formatQuantity(5, 24)).toBe('5本');
    expect(formatQuantity(0, 24)).toBe('0本');
  });
  it('shows only bottles when a case holds one', () => {
    expect(formatQuantity(7, 1)).toBe('7本');
  });
  it('shows negative stock as a total', () => {
    expect(formatQuantity(-5, 24)).toBe('計−5本');
  });
});
```

`tests/unit/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeForSearch } from '@/lib/search';

describe('normalizeForSearch', () => {
  it('folds katakana to hiragana and full-width to half-width', () => {
    expect(normalizeForSearch('コーラ')).toBe('こーら');
    expect(normalizeForSearch('ｺｰﾗ')).toBe('こーら');
    expect(normalizeForSearch('ＣＯＫＥ')).toBe('coke');
  });
});

describe('matchesSearch', () => {
  it('matches regardless of kana type', () => {
    expect(matchesSearch('コカ・コーラ', 'こーら')).toBe(true);
    expect(matchesSearch('ウーロン茶', 'うーろん')).toBe(true);
  });
  it('matches everything for an empty query', () => {
    expect(matchesSearch('コーラ', '  ')).toBe(true);
  });
  it('does not match unrelated names', () => {
    expect(matchesSearch('ビール', 'こーら')).toBe(false);
  });
});
```

`tests/unit/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime, jstDayStart, jstNextDayStart } from '@/lib/dates';

describe('dates', () => {
  it('formats in Japan time', () => {
    expect(formatDateTime(new Date('2026-09-26T05:05:00Z'))).toBe('2026/09/26 14:05');
  });
  it('computes JST day boundaries', () => {
    expect(jstDayStart('2026-09-26').toISOString()).toBe('2026-09-25T15:00:00.000Z');
    expect(jstNextDayStart('2026-09-26').toISOString()).toBe('2026-09-26T15:00:00.000Z');
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `npx vitest run tests/unit`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 4: 実装する**

`src/lib/quantity.ts`:
```ts
export function toBottles(cases: number, bottles: number, unitsPerCase: number): number {
  return cases * unitsPerCase + bottles;
}

export function splitCases(total: number, unitsPerCase: number): { cases: number; bottles: number } {
  return { cases: Math.floor(total / unitsPerCase), bottles: total % unitsPerCase };
}

export function formatQuantity(total: number, unitsPerCase: number): string {
  if (total < 0) return `計−${-total}本`;
  if (unitsPerCase <= 1 || total < unitsPerCase) return `${total}本`;
  const { cases, bottles } = splitCases(total, unitsPerCase);
  if (bottles === 0) return `${cases}ケース（計${total}本）`;
  return `${cases}ケース＋${bottles}本（計${total}本）`;
}
```

`src/lib/search.ts`:
```ts
/** NFKC (full/half width), lower case, katakana → hiragana, no whitespace. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeForSearch(query);
  return q === '' || normalizeForSearch(name).includes(q);
}
```

`src/lib/dates.ts`:
```ts
const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/** Start of the given JST calendar day (YYYY-MM-DD). */
export function jstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

export function jstNextDayStart(ymd: string): Date {
  return new Date(jstDayStart(ymd).getTime() + 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/unit`
Expected: すべて PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: ドメイン型・数量換算・かな検索・JST 日時を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: CSV・取り消し権限・履歴の表示文言・絞り込み条件

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/permissions.ts`, `src/lib/movementLabels.ts`, `src/lib/movementFilter.ts`
- Test: `tests/unit/csv.test.ts`, `tests/unit/permissions.test.ts`, `tests/unit/movementLabels.test.ts`, `tests/unit/movementFilter.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/csv.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('\uFEFFa,b\r\n1,x\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a'], [['x,"y"\nz']])).toBe('\uFEFFa\r\n"x,""y""\nz"\r\n');
  });
  it('writes null as empty', () => {
    expect(toCsv(['a', 'b'], [[null, 2]])).toBe('\uFEFFa,b\r\n,2\r\n');
  });
  it('neutralizes spreadsheet formulas in text but keeps negative numbers', () => {
    expect(toCsv(['a', 'b'], [['=SUM(A1)', -3]])).toBe("\uFEFFa,b\r\n'=SUM(A1),-3\r\n");
  });
});
```

`tests/unit/permissions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canVoid } from '@/lib/permissions';

const now = new Date('2026-09-26T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
const staff = { id: 's1', role: 'staff' as const };
const admin = { id: 'a1', role: 'admin' as const };

describe('canVoid', () => {
  it('lets staff void their own movement within 24 hours', () => {
    expect(canVoid({ staffId: 's1', createdAt: hoursAgo(23), voidedAt: null }, staff, now)).toBe(true);
  });
  it('blocks staff after 24 hours', () => {
    expect(canVoid({ staffId: 's1', createdAt: hoursAgo(25), voidedAt: null }, staff, now)).toBe(false);
  });
  it("blocks staff from voiding someone else's movement", () => {
    expect(canVoid({ staffId: 'x', createdAt: hoursAgo(1), voidedAt: null }, staff, now)).toBe(false);
  });
  it('lets admins void anything not yet voided', () => {
    expect(canVoid({ staffId: 'x', createdAt: hoursAgo(1000), voidedAt: null }, admin, now)).toBe(true);
  });
  it('never allows voiding twice', () => {
    expect(canVoid({ staffId: 'a1', createdAt: hoursAgo(1), voidedAt: hoursAgo(0) }, admin, now)).toBe(false);
  });
});
```

`tests/unit/movementLabels.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeMovement } from '@/lib/movementLabels';

const base = { fromLocationName: null, toLocationName: null, countedQuantity: null, unitsPerCase: 24 };

describe('describeMovement', () => {
  it('describes each movement type', () => {
    expect(describeMovement({ ...base, type: 'receive', toLocationName: '事務所', quantity: 48 })).toBe(
      '事務所に入荷 2ケース（計48本）',
    );
    expect(describeMovement({ ...base, type: 'sale', fromLocationName: 'Kingyo', quantity: 3 })).toBe(
      'Kingyoで販売 3本',
    );
    expect(
      describeMovement({ ...base, type: 'transfer', fromLocationName: '事務所', toLocationName: 'En', quantity: 5 }),
    ).toBe('事務所 → En 5本');
    expect(
      describeMovement({ ...base, type: 'adjust', toLocationName: '暖家', quantity: -3, countedQuantity: 7 }),
    ).toBe('暖家で棚卸 実数7本（差 −3本）');
    expect(
      describeMovement({ ...base, type: 'adjust', toLocationName: '暖家', quantity: 2, countedQuantity: 9 }),
    ).toBe('暖家で棚卸 実数9本（差 +2本）');
  });
});
```

`tests/unit/movementFilter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { movementFilterToQuery, parseMovementFilter } from '@/lib/movementFilter';

const id = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';

describe('parseMovementFilter', () => {
  it('keeps valid values', () => {
    expect(
      parseMovementFilter({ location: id, drink: id, staff: id, type: 'sale', from: '2026-09-01', to: '2026-09-30' }),
    ).toEqual({ locationId: id, drinkId: id, staffId: id, type: 'sale', fromDate: '2026-09-01', toDate: '2026-09-30' });
  });
  it('drops invalid values', () => {
    expect(parseMovementFilter({ location: 'x', type: 'steal', from: '9/1' })).toEqual({});
  });
  it('takes the first value of repeated params', () => {
    expect(parseMovementFilter({ type: ['sale', 'receive'] })).toEqual({ type: 'sale' });
  });
});

describe('movementFilterToQuery', () => {
  it('round-trips', () => {
    const f = { drinkId: id, type: 'sale' as const };
    expect(parseMovementFilter(Object.fromEntries(new URLSearchParams(movementFilterToQuery(f))))).toEqual(f);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/unit`
Expected: 新しい 4 ファイルが FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/lib/csv.ts`:
```ts
type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Prevent CSV injection: a text cell starting with = + - @ would run as a formula in Excel.
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with BOM and CRLF so that Excel opens Japanese text correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return '\uFEFF' + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
```

`src/lib/permissions.ts`:
```ts
import type { Role } from './types';

export const VOID_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canVoid(
  movement: { staffId: string; createdAt: Date; voidedAt: Date | null },
  actor: { id: string; role: Role },
  now: Date = new Date(),
): boolean {
  if (movement.voidedAt) return false;
  if (actor.role === 'admin') return true;
  return movement.staffId === actor.id && now.getTime() - movement.createdAt.getTime() <= VOID_WINDOW_MS;
}
```

`src/lib/movementLabels.ts`:
```ts
import { formatQuantity } from './quantity';
import type { Movement, MovementType } from './types';

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receive: '入荷',
  sale: '販売',
  transfer: '移動',
  adjust: '棚卸',
};

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '±0';
}

export function describeMovement(
  m: Pick<Movement, 'type' | 'fromLocationName' | 'toLocationName' | 'quantity' | 'countedQuantity' | 'unitsPerCase'>,
): string {
  const qty = formatQuantity(m.quantity, m.unitsPerCase);
  switch (m.type) {
    case 'receive':
      return `${m.toLocationName}に入荷 ${qty}`;
    case 'sale':
      return `${m.fromLocationName}で販売 ${qty}`;
    case 'transfer':
      return `${m.fromLocationName} → ${m.toLocationName} ${qty}`;
    case 'adjust':
      return `${m.toLocationName}で棚卸 実数${formatQuantity(m.countedQuantity ?? 0, m.unitsPerCase)}（差 ${signed(m.quantity)}本）`;
  }
}
```

`src/lib/movementFilter.ts`:
```ts
import { YMD_PATTERN } from './dates';
import type { MovementType } from './types';

export interface MovementFilter {
  locationId?: string;
  drinkId?: string;
  staffId?: string;
  type?: MovementType;
  fromDate?: string;
  toDate?: string;
}

type Params = Record<string, string | string[] | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: MovementType[] = ['receive', 'sale', 'transfer', 'adjust'];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseMovementFilter(params: Params): MovementFilter {
  const f: MovementFilter = {};
  const location = first(params.location);
  const drink = first(params.drink);
  const staff = first(params.staff);
  const type = first(params.type);
  const from = first(params.from);
  const to = first(params.to);
  if (location && UUID_PATTERN.test(location)) f.locationId = location;
  if (drink && UUID_PATTERN.test(drink)) f.drinkId = drink;
  if (staff && UUID_PATTERN.test(staff)) f.staffId = staff;
  if (type && (TYPES as string[]).includes(type)) f.type = type as MovementType;
  if (from && YMD_PATTERN.test(from)) f.fromDate = from;
  if (to && YMD_PATTERN.test(to)) f.toDate = to;
  return f;
}

export function movementFilterToQuery(f: MovementFilter): string {
  const q = new URLSearchParams();
  if (f.locationId) q.set('location', f.locationId);
  if (f.drinkId) q.set('drink', f.drinkId);
  if (f.staffId) q.set('staff', f.staffId);
  if (f.type) q.set('type', f.type);
  if (f.fromDate) q.set('from', f.fromDate);
  if (f.toDate) q.set('to', f.toDate);
  return q.toString();
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit`
Expected: すべて PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: CSV 生成・取り消し権限・履歴の表示・絞り込み条件を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 入力チェック・エラーメッセージ・在庫マイナス判定

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/errors.ts`, `src/lib/formState.ts`
- Create: `src/lib/repo/stock.ts`（この Task では純粋関数 `findNegativeResults` だけ）
- Test: `tests/unit/validation.test.ts`, `tests/unit/negative.test.ts`, `tests/unit/errors.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { entrySchema, staffCreateSchema, toMovementInput } from '@/lib/validation';

const a = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';
const b = '1b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f71';
const drink = '2b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f72';

describe('entrySchema', () => {
  it('accepts a transfer between two locations', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'transfer', drinkId: drink, fromLocationId: a, toLocationId: b, quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects a transfer to the same location', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'transfer', drinkId: drink, fromLocationId: a, toLocationId: a, quantity: 5 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('移動元と移動先が同じです');
  });
  it('rejects zero quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'sale', drinkId: drink, fromLocationId: a, quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a stocktake count of zero', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'adjust', drinkId: drink, toLocationId: a, countedQuantity: 0 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an empty batch', () => {
    expect(entrySchema.safeParse({ batchId: a, confirmNegative: false, items: [] }).success).toBe(false);
  });
});

describe('toMovementInput', () => {
  it('fills in nulls and the shared note', () => {
    expect(toMovementInput({ type: 'sale', drinkId: drink, fromLocationId: a, quantity: 2 }, '営業後')).toEqual({
      type: 'sale',
      drinkId: drink,
      fromLocationId: a,
      toLocationId: null,
      quantity: 2,
      countedQuantity: null,
      note: '営業後',
    });
  });
});

describe('staffCreateSchema', () => {
  it('requires a 4-6 digit PIN', () => {
    expect(staffCreateSchema.safeParse({ name: '花子', pin: '12a4', role: 'staff', homeLocationId: null }).success).toBe(
      false,
    );
    expect(staffCreateSchema.safeParse({ name: '花子', pin: '1234', role: 'staff', homeLocationId: null }).success).toBe(
      true,
    );
  });
});
```

`tests/unit/negative.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findNegativeResults } from '@/lib/repo/stock';
import type { MovementInput } from '@/lib/types';

const item = (p: Partial<MovementInput>): MovementInput => ({
  type: 'sale',
  drinkId: 'd',
  fromLocationId: null,
  toLocationId: null,
  quantity: 0,
  countedQuantity: null,
  note: null,
  ...p,
});

describe('findNegativeResults', () => {
  it('reports locations that would go below zero', () => {
    const levels = [{ locationId: 'L1', drinkId: 'd', quantity: 3 }];
    expect(findNegativeResults(levels, [item({ fromLocationId: 'L1', quantity: 5 })])).toEqual([
      { locationId: 'L1', drinkId: 'd', resulting: -2 },
    ]);
  });
  it('accounts for earlier items in the same batch', () => {
    const items = [
      item({ type: 'receive', toLocationId: 'L1', quantity: 5 }),
      item({ fromLocationId: 'L1', quantity: 5 }),
    ];
    expect(findNegativeResults([], items)).toEqual([]);
  });
  it('treats a stocktake as an absolute count', () => {
    const items = [
      item({ type: 'adjust', toLocationId: 'L1', countedQuantity: 1 }),
      item({ fromLocationId: 'L1', quantity: 2 }),
    ];
    expect(findNegativeResults([{ locationId: 'L1', drinkId: 'd', quantity: 50 }], items)).toEqual([
      { locationId: 'L1', drinkId: 'd', resulting: -1 },
    ]);
  });
  it('ignores locations that only receive stock', () => {
    const items = [item({ type: 'transfer', fromLocationId: 'L1', toLocationId: 'L2', quantity: 1 })];
    expect(findNegativeResults([{ locationId: 'L1', drinkId: 'd', quantity: 1 }], items)).toEqual([]);
  });
});
```

`tests/unit/errors.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { toUserMessage } from '@/lib/errors';

describe('toUserMessage', () => {
  it('maps unique violations', () => {
    expect(toUserMessage(Object.assign(new Error('dup'), { code: '23505' }))).toBe('同じ名前がすでに登録されています');
  });
  it('maps known domain errors', () => {
    expect(toUserMessage(new Error('inactive_drink'))).toBe('廃止されたドリンクが含まれています');
    expect(toUserMessage(new Error('already_voided'))).toBe('この記録はすでに取り消されています');
  });
  it('hides unknown errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toUserMessage(new Error('boom'))).toBe('エラーが発生しました。もう一度お試しください');
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/unit`
Expected: 新しい 3 ファイルが FAIL

- [ ] **Step 3: 実装する**

`src/lib/validation.ts`:
```ts
import { z } from 'zod';
import type { MovementInput } from './types';

const uuid = z.string().uuid('不正な ID です');
const quantity = z.number().int('本数は整数で入力してください').min(1, '本数は1本以上にしてください');
const name = z.string().trim().min(1, '名前を入力してください').max(50, '名前は50文字以内にしてください');

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PINは4〜6桁の数字にしてください');
export const roleSchema = z.enum(['admin', 'staff']);

export const movementItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('receive'), drinkId: uuid, toLocationId: uuid, quantity }),
  z.object({ type: z.literal('sale'), drinkId: uuid, fromLocationId: uuid, quantity }),
  z.object({ type: z.literal('transfer'), drinkId: uuid, fromLocationId: uuid, toLocationId: uuid, quantity }),
  z.object({
    type: z.literal('adjust'),
    drinkId: uuid,
    toLocationId: uuid,
    countedQuantity: z.number().int('本数は整数で入力してください').min(0, '本数は0本以上にしてください'),
  }),
]);
export type MovementItem = z.infer<typeof movementItemSchema>;

export const entrySchema = z
  .object({
    batchId: uuid,
    confirmNegative: z.boolean(),
    note: z.string().trim().max(200, 'メモは200文字以内にしてください').optional(),
    items: z.array(movementItemSchema).min(1, 'ドリンクを選んでください').max(50, '一度に登録できるのは50件までです'),
  })
  .superRefine((value, ctx) => {
    value.items.forEach((item, i) => {
      if (item.type === 'transfer' && item.fromLocationId === item.toLocationId) {
        ctx.addIssue({ code: 'custom', path: ['items', i], message: '移動元と移動先が同じです' });
      }
    });
  });

export function toMovementInput(item: MovementItem, note?: string): MovementInput {
  return {
    type: item.type,
    drinkId: item.drinkId,
    fromLocationId: 'fromLocationId' in item ? item.fromLocationId : null,
    toLocationId: 'toLocationId' in item ? item.toLocationId : null,
    quantity: 'quantity' in item ? item.quantity : 0,
    countedQuantity: item.type === 'adjust' ? item.countedQuantity : null,
    note: note ? note : null,
  };
}

export const loginSchema = z.object({ staffId: uuid, pin: pinSchema });

export const staffCreateSchema = z.object({
  name,
  pin: pinSchema,
  role: roleSchema,
  homeLocationId: uuid.nullable(),
});

export const staffUpdateSchema = z.object({
  id: uuid,
  name,
  role: roleSchema,
  homeLocationId: uuid.nullable(),
  isActive: z.boolean(),
});

export const drinkCreateSchema = z.object({
  name,
  unitsPerCase: z.coerce
    .number()
    .int('1ケースの本数は整数で入力してください')
    .min(1, '1ケースの本数は1以上にしてください')
    .max(1000, '1ケースの本数が大きすぎます'),
});

export const locationSchema = z.object({
  name,
  sortOrder: z.coerce.number().int('表示順は整数で入力してください').min(0).max(999),
});
```

`src/lib/errors.ts`:
```ts
const MESSAGES: Record<string, string> = {
  inactive_drink: '廃止されたドリンクが含まれています',
  inactive_location: '無効になった拠点が含まれています',
  already_voided: 'この記録はすでに取り消されています',
  movement_not_found: '記録が見つかりません',
  staff_not_found: 'スタッフが見つかりません',
  cannot_demote_self: '自分自身を無効化したり、スタッフ権限に変更したりはできません',
  invalid_pin_format: 'PINは4〜6桁の数字にしてください',
};

export function toUserMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '23505') return '同じ名前がすでに登録されています';
  const message = error instanceof Error ? error.message : '';
  if (message in MESSAGES) return MESSAGES[message];
  console.error(error);
  return 'エラーが発生しました。もう一度お試しください';
}
```

`src/lib/formState.ts`:
```ts
export type FormState = { error?: string; message?: string };
export const initialFormState: FormState = {};
```

`src/lib/repo/stock.ts`:
```ts
import type { MovementInput, StockLevel } from '../types';

export interface NegativeResult {
  locationId: string;
  drinkId: string;
  resulting: number;
}

const key = (locationId: string, drinkId: string) => `${locationId}:${drinkId}`;

/** Simulates the batch on top of the current levels and lists every decreased pair that ends below zero. */
export function findNegativeResults(levels: StockLevel[], items: MovementInput[]): NegativeResult[] {
  const quantities = new Map<string, number>();
  for (const l of levels) quantities.set(key(l.locationId, l.drinkId), l.quantity);
  const decreased = new Map<string, { locationId: string; drinkId: string }>();
  const add = (locationId: string, drinkId: string, delta: number) => {
    const k = key(locationId, drinkId);
    quantities.set(k, (quantities.get(k) ?? 0) + delta);
    if (delta < 0) decreased.set(k, { locationId, drinkId });
  };
  for (const item of items) {
    if (item.type === 'adjust') {
      if (item.toLocationId) quantities.set(key(item.toLocationId, item.drinkId), item.countedQuantity ?? 0);
      continue;
    }
    if (item.fromLocationId) add(item.fromLocationId, item.drinkId, -item.quantity);
    if (item.toLocationId) add(item.toLocationId, item.drinkId, item.quantity);
  }
  return [...decreased.entries()]
    .map(([k, pair]) => ({ ...pair, resulting: quantities.get(k) ?? 0 }))
    .filter((r) => r.resulting < 0);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit`
Expected: すべて PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 入力チェック・エラーメッセージ・在庫マイナス判定を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: PIN・ロック判定・セッション

**Files:**
- Create: `src/lib/auth/pin.ts`, `src/lib/auth/lockout.ts`, `src/lib/auth/session.ts`
- Test: `tests/unit/pin.test.ts`, `tests/unit/lockout.test.ts`, `tests/unit/session.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/pin.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from '@/lib/auth/pin';

describe('pin', () => {
  it('accepts only 4-6 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
  it('hashes and verifies', async () => {
    const hash = await hashPin('1234');
    expect(hash).not.toContain('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
    expect(await verifyPin('4321', hash)).toBe(false);
  });
  it('refuses to hash an invalid PIN', async () => {
    await expect(hashPin('12')).rejects.toThrow('invalid_pin_format');
  });
});
```

`tests/unit/lockout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_PIN_ATTEMPTS, mayVerify, shouldLockAfterFailure } from '@/lib/auth/lockout';

describe('lockout', () => {
  it('allows verification up to the fifth attempt', () => {
    expect(MAX_PIN_ATTEMPTS).toBe(5);
    expect(mayVerify(5)).toBe(true);
    expect(mayVerify(6)).toBe(false);
  });
  it('locks after the fifth failure', () => {
    expect(shouldLockAfterFailure(4)).toBe(false);
    expect(shouldLockAfterFailure(5)).toBe(true);
  });
});
```

`tests/unit/session.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/lib/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-0123';
});

describe('session', () => {
  it('round-trips the staff id', async () => {
    const token = await signSession('staff-1');
    expect(await verifySession(token)).toBe('staff-1');
  });
  it('rejects a tampered token', async () => {
    const token = await signSession('staff-1');
    expect(await verifySession(token.slice(0, -2) + 'xx')).toBeNull();
  });
  it('rejects garbage', async () => {
    expect(await verifySession('not-a-jwt')).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/unit`
Expected: 新しい 3 ファイルが FAIL

- [ ] **Step 3: 実装する**

`src/lib/auth/pin.ts`:
```ts
import bcrypt from 'bcryptjs';

const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error('invalid_pin_format');
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
```

`src/lib/auth/lockout.ts`:
```ts
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_DURATION_SECONDS = 15 * 60;

/**
 * attemptNumber is failed_pin_attempts right after it was atomically incremented for this attempt.
 * Concurrent attempts beyond the limit are rejected without checking the PIN.
 */
export function mayVerify(attemptNumber: number): boolean {
  return attemptNumber <= MAX_PIN_ATTEMPTS;
}

export function shouldLockAfterFailure(attemptNumber: number): boolean {
  return attemptNumber >= MAX_PIN_ATTEMPTS;
}
```

`src/lib/auth/session.ts`:
```ts
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}

export async function signSession(staffId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the staff id, or null when the token is invalid or expired. */
export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit`
Expected: すべて PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PIN のハッシュ化・ロック判定・セッション JWT を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 操作ログ・スタッフのリポジトリとログイン処理

**Files:**
- Create: `src/lib/repo/audit.ts`, `src/lib/repo/staff.ts`, `src/lib/auth/login.ts`, `scripts/create-admin.ts`
- Test: `tests/db/staff.test.ts`, `tests/db/login.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/staff.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { listAuditLogs } from '@/lib/repo/audit';
import {
  createStaff,
  getStaffById,
  listLoginNames,
  listStaff,
  resetPin,
  unlockStaff,
  updateStaff,
} from '@/lib/repo/staff';
import { verifyPin } from '@/lib/auth/pin';
import { createTestDb, locationIdByName } from '../helpers/testDb';

let db: Db;
let adminId: string;

beforeEach(async () => {
  db = await createTestDb();
  adminId = (await createStaff(db, null, { name: '管理者', pin: '1234', role: 'admin', homeLocationId: null })).id;
});

describe('staff repository', () => {
  it('creates staff with a hashed PIN and logs it', async () => {
    const home = await locationIdByName(db, 'Kingyo');
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: home });
    expect(s).toMatchObject({ name: '花子', role: 'staff', homeLocationId: home, isActive: true });
    const [row] = await db.query<{ pin_hash: string }>('select pin_hash from staff where id = $1', [s.id]);
    expect(await verifyPin('5678', row.pin_hash)).toBe(true);
    const logs = await listAuditLogs(db, 10);
    expect(logs[0]).toMatchObject({ action: 'staff.create', staffName: '管理者', targetId: s.id });
  });

  it('rejects a duplicate active name', async () => {
    await expect(
      createStaff(db, adminId, { name: '管理者', pin: '1111', role: 'staff', homeLocationId: null }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('lists only active staff for login', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    await updateStaff(db, adminId, { id: s.id, name: '花子', role: 'staff', homeLocationId: null, isActive: false });
    expect((await listLoginNames(db)).map((r) => r.name)).toEqual(['管理者']);
    expect((await listStaff(db)).map((r) => r.name).sort()).toEqual(['管理者', '花子'].sort());
  });

  it('does not let an admin demote or deactivate themselves', async () => {
    await expect(
      updateStaff(db, adminId, { id: adminId, name: '管理者', role: 'staff', homeLocationId: null, isActive: true }),
    ).rejects.toThrow('cannot_demote_self');
    await expect(
      updateStaff(db, adminId, { id: adminId, name: '管理者', role: 'admin', homeLocationId: null, isActive: false }),
    ).rejects.toThrow('cannot_demote_self');
  });

  it('resets a PIN and clears the lock', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    await db.query(
      `update staff set failed_pin_attempts = 3, locked_until = now() + interval '1 hour' where id = $1`,
      [s.id],
    );
    await resetPin(db, adminId, s.id, '9999');
    const after = await getStaffById(db, s.id);
    expect(after).toMatchObject({ failedPinAttempts: 0, lockedUntil: null });
    const [row] = await db.query<{ pin_hash: string }>('select pin_hash from staff where id = $1', [s.id]);
    expect(await verifyPin('9999', row.pin_hash)).toBe(true);
  });

  it('unlocks staff', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    await db.query(`update staff set locked_until = now() + interval '1 hour' where id = $1`, [s.id]);
    await unlockStaff(db, adminId, s.id);
    expect((await getStaffById(db, s.id))?.lockedUntil).toBeNull();
    expect((await listAuditLogs(db, 1))[0].action).toBe('staff.unlock');
  });
});
```

`tests/db/login.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { attemptLogin } from '@/lib/auth/login';
import { createStaff, getStaffById, updateStaff } from '@/lib/repo/staff';
import { createTestDb } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = (await createStaff(db, null, { name: '花子', pin: '5678', role: 'admin', homeLocationId: null })).id;
});

describe('attemptLogin', () => {
  it('succeeds with the right PIN and resets the counter', async () => {
    await attemptLogin(db, staffId, '0000');
    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: true, staffId });
    expect((await getStaffById(db, staffId))?.failedPinAttempts).toBe(0);
  });

  it('rejects a wrong PIN', async () => {
    expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('locks after five wrong PINs, even for the right PIN', async () => {
    for (let i = 0; i < 4; i++) {
      expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'locked' });
    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: false, reason: 'locked' });
    const logs = await db.query<{ action: string }>('select action from audit_logs order by created_at desc limit 1');
    expect(logs[0].action).toBe('login.locked');
  });

  it('allows logging in again after the lock expires', async () => {
    for (let i = 0; i < 5; i++) await attemptLogin(db, staffId, '0000');
    await db.query(`update staff set locked_until = now() - interval '1 second' where id = $1`, [staffId]);
    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: true, staffId });
  });

  it('rejects inactive staff', async () => {
    const other = await createStaff(db, staffId, { name: '太郎', pin: '1111', role: 'staff', homeLocationId: null });
    await updateStaff(db, staffId, { id: other.id, name: '太郎', role: 'staff', homeLocationId: null, isActive: false });
    expect(await attemptLogin(db, other.id, '1111')).toEqual({ ok: false, reason: 'invalid' });
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/db/staff.test.ts tests/db/login.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 操作ログのリポジトリを実装する**

`src/lib/repo/audit.ts`:
```ts
import type { Db } from '../db/types';

export interface AuditEntry {
  staffId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details?: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  staffName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (staff_id, action, target_type, target_id, details)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [entry.staffId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.details ?? {})],
  );
}

export async function listAuditLogs(db: Db, limit: number): Promise<AuditLog[]> {
  return db.query<AuditLog>(
    `select a.id, s.name as "staffName", a.action, a.target_type as "targetType",
            a.target_id as "targetId", a.details, a.created_at as "createdAt"
       from audit_logs a
       left join staff s on s.id = a.staff_id
      order by a.created_at desc, a.id
      limit $1`,
    [limit],
  );
}
```

- [ ] **Step 4: スタッフのリポジトリを実装する**

`src/lib/repo/staff.ts`:
```ts
import type { Db } from '../db/types';
import { hashPin } from '../auth/pin';
import { LOCK_DURATION_SECONDS } from '../auth/lockout';
import type { Role, Staff } from '../types';
import { writeAudit } from './audit';

const STAFF_COLUMNS = `id, name, role, home_location_id as "homeLocationId", is_active as "isActive",
  failed_pin_attempts as "failedPinAttempts", locked_until as "lockedUntil"`;

export async function listStaff(db: Db): Promise<Staff[]> {
  return db.query<Staff>(`select ${STAFF_COLUMNS} from staff order by is_active desc, name`);
}

export async function listLoginNames(db: Db): Promise<{ id: string; name: string }[]> {
  return db.query<{ id: string; name: string }>('select id, name from staff where is_active order by name');
}

export async function getStaffById(db: Db, id: string): Promise<Staff | null> {
  const rows = await db.query<Staff>(`select ${STAFF_COLUMNS} from staff where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getPinHash(db: Db, id: string): Promise<string | null> {
  const rows = await db.query<{ pinHash: string }>('select pin_hash as "pinHash" from staff where id = $1', [id]);
  return rows[0]?.pinHash ?? null;
}

/**
 * Atomically counts this login attempt. Returns the attempt number,
 * or null when the staff member is inactive, missing or currently locked.
 */
export async function reservePinAttempt(db: Db, id: string): Promise<number | null> {
  const rows = await db.query<{ attempt: number }>(
    `update staff set failed_pin_attempts = failed_pin_attempts + 1
      where id = $1 and is_active and (locked_until is null or locked_until <= now())
      returning failed_pin_attempts as "attempt"`,
    [id],
  );
  return rows[0]?.attempt ?? null;
}

export async function recordPinSuccess(db: Db, id: string): Promise<void> {
  await db.query('update staff set failed_pin_attempts = 0, locked_until = null where id = $1', [id]);
}

export async function lockStaff(db: Db, id: string): Promise<void> {
  await db.query(
    `update staff set failed_pin_attempts = 0, locked_until = now() + make_interval(secs => $2) where id = $1`,
    [id, LOCK_DURATION_SECONDS],
  );
}

export async function createStaff(
  db: Db,
  actorId: string | null,
  input: { name: string; pin: string; role: Role; homeLocationId: string | null },
): Promise<Staff> {
  const pinHash = await hashPin(input.pin);
  return db.transaction(async (tx) => {
    const [staff] = await tx.query<Staff>(
      `insert into staff (name, pin_hash, role, home_location_id) values ($1, $2, $3, $4)
       returning ${STAFF_COLUMNS}`,
      [input.name, pinHash, input.role, input.homeLocationId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'staff.create',
      targetType: 'staff',
      targetId: staff.id,
      details: { name: input.name, role: input.role, homeLocationId: input.homeLocationId },
    });
    return staff;
  });
}

export async function updateStaff(
  db: Db,
  actorId: string,
  input: { id: string; name: string; role: Role; homeLocationId: string | null; isActive: boolean },
): Promise<void> {
  if (input.id === actorId && (input.role !== 'admin' || !input.isActive)) throw new Error('cannot_demote_self');
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      `update staff set name = $2, role = $3, home_location_id = $4, is_active = $5, updated_at = now()
        where id = $1 returning id`,
      [input.id, input.name, input.role, input.homeLocationId, input.isActive],
    );
    if (rows.length === 0) throw new Error('staff_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: 'staff.update',
      targetType: 'staff',
      targetId: input.id,
      details: { name: input.name, role: input.role, homeLocationId: input.homeLocationId, isActive: input.isActive },
    });
  });
}

export async function resetPin(db: Db, actorId: string, id: string, pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      `update staff set pin_hash = $2, failed_pin_attempts = 0, locked_until = null, updated_at = now()
        where id = $1 returning id`,
      [id, pinHash],
    );
    if (rows.length === 0) throw new Error('staff_not_found');
    await writeAudit(tx, { staffId: actorId, action: 'staff.reset_pin', targetType: 'staff', targetId: id });
  });
}

export async function unlockStaff(db: Db, actorId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      'update staff set failed_pin_attempts = 0, locked_until = null where id = $1 returning id',
      [id],
    );
    if (rows.length === 0) throw new Error('staff_not_found');
    await writeAudit(tx, { staffId: actorId, action: 'staff.unlock', targetType: 'staff', targetId: id });
  });
}
```

- [ ] **Step 5: ログイン処理を実装する**

`src/lib/auth/login.ts`:
```ts
import type { Db } from '../db/types';
import { writeAudit } from '../repo/audit';
import { getPinHash, getStaffById, lockStaff, recordPinSuccess, reservePinAttempt } from '../repo/staff';
import { mayVerify, shouldLockAfterFailure } from './lockout';
import { verifyPin } from './pin';

export type LoginResult = { ok: true; staffId: string } | { ok: false; reason: 'invalid' | 'locked' };

export async function attemptLogin(db: Db, staffId: string, pin: string): Promise<LoginResult> {
  const attempt = await reservePinAttempt(db, staffId);
  if (attempt === null) {
    const staff = await getStaffById(db, staffId);
    return { ok: false, reason: staff?.isActive ? 'locked' : 'invalid' };
  }
  if (!mayVerify(attempt)) {
    await lockStaff(db, staffId);
    return { ok: false, reason: 'locked' };
  }

  const hash = await getPinHash(db, staffId);
  if (hash && (await verifyPin(pin, hash))) {
    await recordPinSuccess(db, staffId);
    return { ok: true, staffId };
  }

  if (shouldLockAfterFailure(attempt)) {
    await lockStaff(db, staffId);
    await writeAudit(db, { staffId, action: 'login.locked', targetType: 'staff', targetId: staffId });
    return { ok: false, reason: 'locked' };
  }
  return { ok: false, reason: 'invalid' };
}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npx vitest run tests/db`
Expected: すべて PASS

- [ ] **Step 7: 最初の管理者を作るスクリプトを書く**

`scripts/create-admin.ts`:
```ts
import { createPostgresDb } from '../src/lib/db/postgres';
import { createStaff } from '../src/lib/repo/staff';

const [name, pin, homeLocationName] = process.argv.slice(2);
if (!name || !pin) {
  console.error('usage: npm run db:create-admin -- <名前> <PIN(4〜6桁)> [所属拠点名]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}

const db = createPostgresDb(url);
let homeLocationId: string | null = null;
if (homeLocationName) {
  const rows = await db.query<{ id: string }>('select id from locations where name = $1', [homeLocationName]);
  if (!rows[0]) {
    console.error(`拠点が見つかりません: ${homeLocationName}`);
    process.exit(1);
  }
  homeLocationId = rows[0].id;
}
const staff = await createStaff(db, null, { name, pin, role: 'admin', homeLocationId });
console.log(`created admin: ${staff.name} (${staff.id})`);
process.exit(0);
```

- [ ] **Step 8: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: スタッフ・操作ログのリポジトリと PIN ログイン処理を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ドリンク・拠点・在庫・履歴のリポジトリ

**Files:**
- Create: `src/lib/repo/drinks.ts`, `src/lib/repo/locations.ts`, `src/lib/repo/movements.ts`
- Modify: `src/lib/repo/stock.ts`（DB を使う関数を追加）
- Test: `tests/db/drinks.test.ts`, `tests/db/locations.test.ts`, `tests/db/stock.test.ts`, `tests/db/movements.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/drinks.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createDrink, listDrinks, setDrinkActive } from '@/lib/repo/drinks';
import { listAuditLogs } from '@/lib/repo/audit';
import { createTestDb, insertStaff } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
});

describe('drinks repository', () => {
  it('creates a drink and logs it', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    expect(d).toMatchObject({ name: 'コーラ', unitsPerCase: 24, isActive: true });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'drink.create', targetId: d.id });
  });

  it('hides retired drinks unless asked', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    await createDrink(db, staffId, { name: 'ビール', unitsPerCase: 24 });
    await setDrinkActive(db, staffId, d.id, false);
    expect((await listDrinks(db)).map((x) => x.name)).toEqual(['ビール']);
    expect((await listDrinks(db, { includeInactive: true })).length).toBe(2);
    expect((await listAuditLogs(db, 1))[0].action).toBe('drink.deactivate');
  });

  it('rejects duplicate names', async () => {
    await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    await expect(createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 12 })).rejects.toMatchObject({
      code: '23505',
    });
  });
});
```

`tests/db/locations.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createLocation, listLocations, updateLocation } from '@/lib/repo/locations';
import { createTestDb, insertStaff } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db, '管理者', 'admin');
});

describe('locations repository', () => {
  it('lists active locations in display order', async () => {
    expect((await listLocations(db)).map((l) => l.name)).toEqual(['事務所', 'Kingyo', 'B-club', '暖家', 'En']);
  });

  it('adds, renames and deactivates a location', async () => {
    const l = await createLocation(db, staffId, { name: '新店', sortOrder: 6 });
    await updateLocation(db, staffId, { id: l.id, name: '新店舗', sortOrder: 0, isActive: true });
    expect((await listLocations(db))[0].name).toBe('新店舗');
    await updateLocation(db, staffId, { id: l.id, name: '新店舗', sortOrder: 0, isActive: false });
    expect((await listLocations(db)).map((x) => x.name)).not.toContain('新店舗');
    expect((await listLocations(db, { includeInactive: true })).map((x) => x.name)).toContain('新店舗');
  });
});
```

`tests/db/stock.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { applyMovements, batchExists, getStockLevels } from '@/lib/repo/stock';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('stock repository', () => {
  it('applies movements and reads levels', async () => {
    const staffId = await insertStaff(db);
    const drinkId = await insertDrink(db);
    const office = await locationIdByName(db, '事務所');
    const batchId = crypto.randomUUID();
    expect(await batchExists(db, batchId)).toBe(false);
    const ids = await applyMovements(db, batchId, staffId, [
      {
        type: 'receive',
        drinkId,
        fromLocationId: null,
        toLocationId: office,
        quantity: 48,
        countedQuantity: null,
        note: null,
      },
    ]);
    expect(ids).toHaveLength(1);
    expect(await batchExists(db, batchId)).toBe(true);
    expect(await getStockLevels(db)).toEqual([{ locationId: office, drinkId, quantity: 48 }]);
  });
});
```

`tests/db/movements.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { getMovementForVoid, listMovements, voidMovement } from '@/lib/repo/movements';
import { applyMovements } from '@/lib/repo/stock';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;
let staffId: string;
let drinkId: string;
let office: string;
let kingyo: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db, '花子');
  drinkId = await insertDrink(db);
  office = await locationIdByName(db, '事務所');
  kingyo = await locationIdByName(db, 'Kingyo');
  await applyMovements(db, crypto.randomUUID(), staffId, [
    { type: 'receive', drinkId, fromLocationId: null, toLocationId: office, quantity: 48, countedQuantity: null, note: null },
  ]);
  await applyMovements(db, crypto.randomUUID(), staffId, [
    { type: 'transfer', drinkId, fromLocationId: office, toLocationId: kingyo, quantity: 5, countedQuantity: null, note: null },
  ]);
});

describe('movements repository', () => {
  it('lists movements newest first with names', async () => {
    const rows = await listMovements(db, {}, 100);
    expect(rows.map((r) => r.type)).toEqual(['transfer', 'receive']);
    expect(rows[0]).toMatchObject({
      drinkName: 'コーラ',
      unitsPerCase: 24,
      fromLocationName: '事務所',
      toLocationName: 'Kingyo',
      staffName: '花子',
      voidedAt: null,
    });
  });

  it('filters by location on either side and by type', async () => {
    expect((await listMovements(db, { locationId: kingyo }, 100)).map((r) => r.type)).toEqual(['transfer']);
    expect((await listMovements(db, { type: 'receive' }, 100)).map((r) => r.type)).toEqual(['receive']);
  });

  it('filters by JST date range', async () => {
    expect(await listMovements(db, { toDate: '2000-01-01' }, 100)).toEqual([]);
  });

  it('voids a movement and shows who voided it', async () => {
    const [latest] = await listMovements(db, {}, 1);
    const target = await getMovementForVoid(db, latest.id);
    expect(target).toMatchObject({ id: latest.id, staffId, voidedAt: null });
    await voidMovement(db, latest.id, staffId);
    const [after] = await listMovements(db, {}, 1);
    expect(after.voidedByName).toBe('花子');
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/db`
Expected: 新しい 4 ファイルが FAIL

- [ ] **Step 3: ドリンクと拠点のリポジトリを実装する**

`src/lib/repo/drinks.ts`:
```ts
import type { Db } from '../db/types';
import type { Drink } from '../types';
import { writeAudit } from './audit';

const DRINK_COLUMNS = `id, name, units_per_case as "unitsPerCase", is_active as "isActive", created_at as "createdAt"`;

export async function listDrinks(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Drink[]> {
  const where = opts.includeInactive ? '' : 'where is_active';
  return db.query<Drink>(`select ${DRINK_COLUMNS} from drinks ${where} order by name`);
}

export async function createDrink(
  db: Db,
  actorId: string,
  input: { name: string; unitsPerCase: number },
): Promise<Drink> {
  return db.transaction(async (tx) => {
    const [drink] = await tx.query<Drink>(
      `insert into drinks (name, units_per_case, created_by) values ($1, $2, $3) returning ${DRINK_COLUMNS}`,
      [input.name, input.unitsPerCase, actorId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'drink.create',
      targetType: 'drink',
      targetId: drink.id,
      details: { name: input.name, unitsPerCase: input.unitsPerCase },
    });
    return drink;
  });
}

export async function setDrinkActive(db: Db, actorId: string, id: string, isActive: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ name: string }>(
      'update drinks set is_active = $2 where id = $1 returning name',
      [id, isActive],
    );
    if (rows.length === 0) throw new Error('drink_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: isActive ? 'drink.activate' : 'drink.deactivate',
      targetType: 'drink',
      targetId: id,
      details: { name: rows[0].name },
    });
  });
}
```

`src/lib/repo/locations.ts`:
```ts
import type { Db } from '../db/types';
import type { Location } from '../types';
import { writeAudit } from './audit';

const LOCATION_COLUMNS = `id, name, sort_order as "sortOrder", is_active as "isActive"`;

export async function listLocations(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Location[]> {
  const where = opts.includeInactive ? '' : 'where is_active';
  return db.query<Location>(`select ${LOCATION_COLUMNS} from locations ${where} order by sort_order, name`);
}

export async function createLocation(
  db: Db,
  actorId: string,
  input: { name: string; sortOrder: number },
): Promise<Location> {
  return db.transaction(async (tx) => {
    const [location] = await tx.query<Location>(
      `insert into locations (name, sort_order) values ($1, $2) returning ${LOCATION_COLUMNS}`,
      [input.name, input.sortOrder],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'location.create',
      targetType: 'location',
      targetId: location.id,
      details: input,
    });
    return location;
  });
}

export async function updateLocation(
  db: Db,
  actorId: string,
  input: { id: string; name: string; sortOrder: number; isActive: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      'update locations set name = $2, sort_order = $3, is_active = $4 where id = $1 returning id',
      [input.id, input.name, input.sortOrder, input.isActive],
    );
    if (rows.length === 0) throw new Error('location_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: 'location.update',
      targetType: 'location',
      targetId: input.id,
      details: { name: input.name, sortOrder: input.sortOrder, isActive: input.isActive },
    });
  });
}
```

`src/lib/errors.ts` の `MESSAGES` に 2 行追加する:
```ts
  drink_not_found: 'ドリンクが見つかりません',
  location_not_found: '拠点が見つかりません',
```

- [ ] **Step 4: 在庫のリポジトリに DB 関数を追加する**

`src/lib/repo/stock.ts` の先頭の import を次に置き換え:
```ts
import type { Db } from '../db/types';
import type { MovementInput, StockLevel } from '../types';
```
ファイル末尾に追加:
```ts
export async function getStockLevels(db: Db): Promise<StockLevel[]> {
  return db.query<StockLevel>(
    'select location_id as "locationId", drink_id as "drinkId", quantity from stock_levels',
  );
}

export async function batchExists(db: Db, batchId: string): Promise<boolean> {
  const rows = await db.query('select 1 from stock_movements where batch_id = $1 limit 1', [batchId]);
  return rows.length > 0;
}

/** Applies the batch atomically (see apply_movements). Returns the ids of the stored movements. */
export async function applyMovements(
  db: Db,
  batchId: string,
  staffId: string,
  items: MovementInput[],
): Promise<string[]> {
  const payload = items.map((i) => ({
    type: i.type,
    drink_id: i.drinkId,
    from_location_id: i.fromLocationId,
    to_location_id: i.toLocationId,
    quantity: i.type === 'adjust' ? null : i.quantity,
    counted_quantity: i.countedQuantity,
    note: i.note,
  }));
  const rows = await db.query<{ id: string }>('select id from apply_movements($1, $2, $3::jsonb)', [
    batchId,
    staffId,
    JSON.stringify(payload),
  ]);
  return rows.map((r) => r.id);
}
```

- [ ] **Step 5: 履歴のリポジトリを実装する**

`src/lib/repo/movements.ts`:
```ts
import type { Db } from '../db/types';
import { jstDayStart, jstNextDayStart } from '../dates';
import type { MovementFilter } from '../movementFilter';
import type { Movement } from '../types';

export async function listMovements(db: Db, filter: MovementFilter, limit: number): Promise<Movement[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (filter.locationId) add((p) => `(m.from_location_id = ${p} or m.to_location_id = ${p})`, filter.locationId);
  if (filter.drinkId) add((p) => `m.drink_id = ${p}`, filter.drinkId);
  if (filter.staffId) add((p) => `m.staff_id = ${p}`, filter.staffId);
  if (filter.type) add((p) => `m.type = ${p}`, filter.type);
  if (filter.fromDate) add((p) => `m.created_at >= ${p}::timestamptz`, jstDayStart(filter.fromDate).toISOString());
  if (filter.toDate) add((p) => `m.created_at < ${p}::timestamptz`, jstNextDayStart(filter.toDate).toISOString());
  params.push(limit);

  return db.query<Movement>(
    `select m.id, m.batch_id as "batchId", m.type, m.drink_id as "drinkId", d.name as "drinkName",
            d.units_per_case as "unitsPerCase",
            m.from_location_id as "fromLocationId", fl.name as "fromLocationName",
            m.to_location_id as "toLocationId", tl.name as "toLocationName",
            m.quantity, m.counted_quantity as "countedQuantity", m.note,
            m.staff_id as "staffId", s.name as "staffName", m.created_at as "createdAt",
            m.voided_at as "voidedAt", vs.name as "voidedByName"
       from stock_movements m
       join drinks d on d.id = m.drink_id
       join staff s on s.id = m.staff_id
       left join locations fl on fl.id = m.from_location_id
       left join locations tl on tl.id = m.to_location_id
       left join staff vs on vs.id = m.voided_by
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by m.created_at desc, m.line_no
      limit $${params.length}`,
    params,
  );
}

export async function getMovementForVoid(
  db: Db,
  id: string,
): Promise<{ id: string; staffId: string; createdAt: Date; voidedAt: Date | null } | null> {
  const rows = await db.query<{ id: string; staffId: string; createdAt: Date; voidedAt: Date | null }>(
    `select id, staff_id as "staffId", created_at as "createdAt", voided_at as "voidedAt"
       from stock_movements where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function voidMovement(db: Db, id: string, actorId: string): Promise<void> {
  await db.query('select void_movement($1, $2)', [id, actorId]);
}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test`
Expected: すべて PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: ドリンク・拠点・在庫・履歴のリポジトリを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 認証まわり（Cookie）とログイン画面・アプリの枠

**Files:**
- Create: `src/lib/auth/current.ts`, `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx`, `src/app/login/actions.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/BottomNav.tsx`, `src/app/(app)/page.tsx`（仮。Task 12 で置き換え）
- Delete: `src/app/page.tsx`

画面のテストは Task 18 の E2E で行う。この Task ではビルドと手動確認をする。

- [ ] **Step 1: 現在のスタッフを取得する処理を書く**

`src/lib/auth/current.ts`:
```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '../db/client';
import { getStaffById } from '../repo/staff';
import type { Staff } from '../types';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession } from './session';

/** The logged-in staff member, re-read from the DB on every request so deactivation takes effect immediately. */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const staffId = await verifySession(token);
  if (!staffId) return null;
  const staff = await getStaffById(getDb(), staffId);
  return staff?.isActive ? staff : null;
});

export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');
  return staff;
}

export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== 'admin') redirect('/');
  return staff;
}

export async function setSessionCookie(staffId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await signSession(staffId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
```

- [ ] **Step 2: ログインの Server Action を書く**

`src/app/login/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { attemptLogin } from '@/lib/auth/login';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import type { FormState } from '@/lib/formState';
import { loginSchema } from '@/lib/validation';

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ staffId: formData.get('staffId'), pin: formData.get('pin') });
  if (!parsed.success) return { error: '名前を選び、4〜6桁のPINを入力してください' };

  const result = await attemptLogin(getDb(), parsed.data.staffId, parsed.data.pin);
  if (!result.ok) {
    return {
      error:
        result.reason === 'locked'
          ? 'PINを5回間違えたため、15分間ログインできません。急ぐ場合は管理者に解除を頼んでください'
          : 'PINが違います',
    };
  }
  await setSessionCookie(result.staffId);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
```

- [ ] **Step 3: ログイン画面を書く**

`src/app/login/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLoginNames } from '@/lib/repo/staff';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentStaff()) redirect('/');
  const names = await listLoginNames(getDb());
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-center text-xl font-bold">ドリンク在庫</h1>
      <LoginForm names={names} />
    </main>
  );
}
```

`src/app/login/LoginForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import { loginAction } from './actions';

export function LoginForm({ names }: { names: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(loginAction, initialFormState);
  return (
    <form action={formAction} className="space-y-4 rounded-lg bg-white p-6 shadow">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">名前</span>
        <select name="staffId" required defaultValue="" className="w-full rounded border px-3 py-2">
          <option value="" disabled>
            選んでください
          </option>
          {names.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">PIN</span>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{4,6}"
          required
          className="w-full rounded border px-3 py-2 tracking-widest"
        />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-blue-600 py-2 font-bold text-white disabled:opacity-50">
        ログイン
      </button>
    </form>
  );
}
```

- [ ] **Step 4: ログイン後の枠（ヘッダーと下部タブ）を書く**

`src/app/(app)/layout.tsx`:
```tsx
import { requireStaff } from '@/lib/auth/current';
import { logoutAction } from '../login/actions';
import { BottomNav } from './BottomNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="mx-auto min-h-dvh max-w-4xl pb-20">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2 text-sm">
        <span className="font-bold">ドリンク在庫</span>
        <form action={logoutAction} className="flex items-center gap-3">
          <span>{staff.name}</span>
          <button className="text-blue-600 underline">ログアウト</button>
        </form>
      </header>
      <main className="px-4 py-4">{children}</main>
      <BottomNav isAdmin={staff.role === 'admin'} />
    </div>
  );
}
```

`src/app/(app)/BottomNav.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '在庫' },
  { href: '/entry', label: '入力' },
  { href: '/history', label: '履歴' },
  { href: '/drinks', label: 'ドリンク' },
];

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...ITEMS, { href: '/admin', label: '管理' }] : ITEMS;
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t bg-white">
      <ul className="mx-auto flex max-w-4xl">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`block py-3 text-center text-sm ${active ? 'font-bold text-blue-600' : 'text-gray-600'}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`src/app/(app)/page.tsx`（仮）:
```tsx
export default function StockPage() {
  return <p>在庫</p>;
}
```

- [ ] **Step 5: 仮のトップページを削除する**

```bash
git rm src/app/page.tsx
```

- [ ] **Step 6: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: PIN ログイン画面とログイン後の枠を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 在庫一覧（検索・全拠点表示）

**Files:**
- Modify: `src/app/(app)/page.tsx`（置き換え）
- Create: `src/app/(app)/StockView.tsx`

- [ ] **Step 1: サーバー側のページを書く**

`src/app/(app)/page.tsx`:
```tsx
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { StockView } from './StockView';

export default async function StockPage() {
  const staff = await requireStaff();
  const db = getDb();
  const [locations, drinks, levels] = await Promise.all([listLocations(db), listDrinks(db), getStockLevels(db)]);
  const defaultLocationId =
    locations.find((l) => l.id === staff.homeLocationId)?.id ?? locations[0]?.id ?? 'all';
  return <StockView locations={locations} drinks={drinks} levels={levels} defaultLocationId={defaultLocationId} />;
}
```

- [ ] **Step 2: 画面（クライアント）を書く**

`src/app/(app)/StockView.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatQuantity } from '@/lib/quantity';
import { matchesSearch } from '@/lib/search';
import type { Drink, Location, StockLevel } from '@/lib/types';

type Props = { locations: Location[]; drinks: Drink[]; levels: StockLevel[]; defaultLocationId: string };

export function StockView({ locations, drinks, levels, defaultLocationId }: Props) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [query, setQuery] = useState('');

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of levels) map.set(`${l.locationId}:${l.drinkId}`, l.quantity);
    return map;
  }, [levels]);
  const qty = (loc: string, drink: string) => quantities.get(`${loc}:${drink}`) ?? 0;
  const visible = drinks.filter((d) => matchesSearch(d.name, query));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-gray-600">表示する拠点</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded border bg-white px-3 py-2"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="all">全拠点</option>
          </select>
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-gray-600">検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ドリンク名"
            className="w-full rounded border bg-white px-3 py-2"
          />
        </label>
      </div>

      {visible.length === 0 && <p className="text-gray-500">該当するドリンクがありません</p>}

      {locationId === 'all' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="sticky left-0 bg-gray-100 px-3 py-2 text-left">ドリンク</th>
                {locations.map((l) => (
                  <th key={l.id} className="whitespace-nowrap px-3 py-2 text-right">
                    {l.name}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right">合計</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => {
                const total = locations.reduce((sum, l) => sum + qty(l.id, d.id), 0);
                return (
                  <tr key={d.id} className="border-t">
                    <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2">
                      <Link href={`/history?drink=${d.id}`} className="text-blue-700 underline">
                        {d.name}
                      </Link>
                    </td>
                    {locations.map((l) => {
                      const n = qty(l.id, d.id);
                      return (
                        <td key={l.id} className={`whitespace-nowrap px-3 py-2 text-right ${n < 0 ? 'text-red-600' : ''}`}>
                          {formatQuantity(n, d.unitsPerCase)}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold">
                      {formatQuantity(total, d.unitsPerCase)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {visible.map((d) => {
            const n = qty(locationId, d.id);
            return (
              <li key={d.id} className="flex items-center justify-between px-3 py-3">
                <Link href={`/history?drink=${d.id}`} className="text-blue-700 underline">
                  {d.name}
                </Link>
                <span className={n < 0 ? 'font-bold text-red-600' : ''}>{formatQuantity(n, d.unitsPerCase)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: 在庫一覧（拠点切り替え・全拠点表・検索）を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ドリンクの登録・廃止

**Files:**
- Create: `src/app/(app)/drinks/page.tsx`, `src/app/(app)/drinks/DrinkCreateForm.tsx`, `src/app/(app)/drinks/actions.ts`

- [ ] **Step 1: Server Action を書く**

`src/app/(app)/drinks/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createDrink, setDrinkActive } from '@/lib/repo/drinks';
import { drinkCreateSchema } from '@/lib/validation';

export async function createDrinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = drinkCreateSchema.safeParse({
    name: formData.get('name'),
    unitsPerCase: formData.get('unitsPerCase'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createDrink(getDb(), staff.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: `${parsed.data.name} を登録しました` };
}

export async function setDrinkActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const isActive = formData.get('isActive') === 'true';
  await setDrinkActive(getDb(), admin.id, id, isActive);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 2: 登録フォームを書く**

`src/app/(app)/drinks/DrinkCreateForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import { createDrinkAction } from './actions';

export function DrinkCreateForm() {
  const [state, formAction, pending] = useActionState(createDrinkAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">ドリンクを登録</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">ドリンク名</span>
          <input name="name" required maxLength={50} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="w-32">
          <span className="mb-1 block text-sm">1ケースの本数</span>
          <input
            name="unitsPerCase"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={24}
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        登録
      </button>
    </form>
  );
}
```

- [ ] **Step 3: 一覧ページを書く**

`src/app/(app)/drinks/page.tsx`:
```tsx
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { setDrinkActiveAction } from './actions';
import { DrinkCreateForm } from './DrinkCreateForm';

export default async function DrinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const showAll = (await searchParams).all === '1';
  const drinks = await listDrinks(getDb(), { includeInactive: showAll });
  const isAdmin = staff.role === 'admin';

  return (
    <div className="space-y-4">
      <DrinkCreateForm />
      <div className="flex items-center justify-between">
        <h2 className="font-bold">ドリンク一覧</h2>
        <Link href={showAll ? '/drinks' : '/drinks?all=1'} className="text-sm text-blue-700 underline">
          {showAll ? '廃止済みを隠す' : '廃止済みも表示'}
        </Link>
      </div>
      <ul className="divide-y rounded border bg-white">
        {drinks.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-3">
            <span className={d.isActive ? '' : 'text-gray-400 line-through'}>
              {d.name}
              <span className="ml-2 text-xs text-gray-500">1ケース{d.unitsPerCase}本</span>
            </span>
            {isAdmin && (
              <form action={setDrinkActiveAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="isActive" value={String(!d.isActive)} />
                <button className="text-sm text-blue-700 underline">{d.isActive ? '廃止' : '復活'}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ドリンクの登録と廃止・復活を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 入荷・販売・移動・棚卸の入力

**Files:**
- Create: `src/app/(app)/entry/page.tsx`, `src/app/(app)/entry/EntryForm.tsx`, `src/app/(app)/entry/DrinkPicker.tsx`, `src/app/(app)/entry/actions.ts`

- [ ] **Step 1: Server Action を書く**

`src/app/(app)/entry/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { applyMovements, batchExists, findNegativeResults, getStockLevels } from '@/lib/repo/stock';
import { entrySchema, toMovementInput } from '@/lib/validation';

export type EntryResult =
  | { status: 'ok'; count: number }
  | { status: 'confirm'; warnings: string[] }
  | { status: 'error'; message: string };

export async function submitEntry(payload: unknown): Promise<EntryResult> {
  const staff = await requireStaff();
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? '入力内容を確認してください' };
  }
  const { batchId, confirmNegative, note } = parsed.data;
  const items = parsed.data.items.map((item) => toMovementInput(item, note));
  const db = getDb();

  try {
    // A retry of a batch that was already stored must not ask for confirmation again.
    if (await batchExists(db, batchId)) return { status: 'ok', count: items.length };

    if (!confirmNegative) {
      const negatives = findNegativeResults(await getStockLevels(db), items);
      if (negatives.length > 0) {
        const [drinks, locations] = await Promise.all([
          listDrinks(db, { includeInactive: true }),
          listLocations(db, { includeInactive: true }),
        ]);
        const drinkName = new Map(drinks.map((d) => [d.id, d.name]));
        const locationName = new Map(locations.map((l) => [l.id, l.name]));
        return {
          status: 'confirm',
          warnings: negatives.map(
            (n) => `${locationName.get(n.locationId)}の${drinkName.get(n.drinkId)}が ${n.resulting}本 になります`,
          ),
        };
      }
    }

    const ids = await applyMovements(db, batchId, staff.id, items);
    revalidatePath('/', 'layout');
    return { status: 'ok', count: ids.length };
  } catch (e) {
    return { status: 'error', message: toUserMessage(e) };
  }
}
```

- [ ] **Step 2: ドリンクの選択部品を書く**

`src/app/(app)/entry/DrinkPicker.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { matchesSearch } from '@/lib/search';
import type { Drink } from '@/lib/types';

type Props = { drinks: Drink[]; value: string; onChange: (id: string) => void; label: string };

export function DrinkPicker({ drinks, value, onChange, label }: Props) {
  const [query, setQuery] = useState('');
  const options = drinks.filter((d) => d.id === value || matchesSearch(d.name, query));
  return (
    <div className="flex gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="絞り込み"
        aria-label={`${label}の絞り込み`}
        className="w-28 rounded border px-2 py-2 text-sm"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="min-w-0 flex-1 rounded border bg-white px-2 py-2"
      >
        <option value="">ドリンクを選択</option>
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: 入力フォームを書く**

`src/app/(app)/entry/EntryForm.tsx`:
```tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { formatQuantity, toBottles } from '@/lib/quantity';
import type { Drink, Location, MovementType, StockLevel } from '@/lib/types';
import { submitEntry } from './actions';
import { DrinkPicker } from './DrinkPicker';

type Line = { key: string; drinkId: string; cases: string; bottles: string };
type Props = { drinks: Drink[]; locations: Location[]; levels: StockLevel[]; defaultLocationId: string };

const TYPES: MovementType[] = ['receive', 'sale', 'transfer', 'adjust'];
const newLine = (): Line => ({ key: crypto.randomUUID(), drinkId: '', cases: '', bottles: '' });
const toInt = (s: string) => (s.trim() === '' ? 0 : Number(s));

export function EntryForm({ drinks, locations, levels, defaultLocationId }: Props) {
  const [type, setType] = useState<MovementType>('receive');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [destinationId, setDestinationId] = useState(
    locations.find((l) => l.id !== defaultLocationId)?.id ?? '',
  );
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [note, setNote] = useState('');
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const drinkById = useMemo(() => new Map(drinks.map((d) => [d.id, d])), [drinks]);
  const stockOf = (loc: string, drink: string) =>
    levels.find((l) => l.locationId === loc && l.drinkId === drink)?.quantity ?? 0;

  const resetFeedback = () => {
    setWarnings(null);
    setMessage(null);
  };
  const updateLine = (key: string, patch: Partial<Line>) => {
    resetFeedback();
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  function buildItems(): { items: unknown[] } | { error: string } {
    const filled = lines.filter((l) => l.drinkId);
    if (filled.length === 0) return { error: 'ドリンクを選んでください' };
    if (type === 'transfer' && locationId === destinationId) return { error: '移動元と移動先が同じです' };
    const items: unknown[] = [];
    for (const line of filled) {
      const drink = drinkById.get(line.drinkId);
      if (!drink) return { error: 'ドリンクを選び直してください' };
      const cases = toInt(line.cases);
      const bottles = toInt(line.bottles);
      if (!Number.isInteger(cases) || !Number.isInteger(bottles) || cases < 0 || bottles < 0) {
        return { error: `${drink.name}の数量が正しくありません` };
      }
      const total = toBottles(cases, bottles, drink.unitsPerCase);
      if (type === 'adjust') {
        items.push({ type, drinkId: drink.id, toLocationId: locationId, countedQuantity: total });
        continue;
      }
      if (total < 1) return { error: `${drink.name}の数量を入力してください` };
      if (type === 'receive') items.push({ type, drinkId: drink.id, toLocationId: locationId, quantity: total });
      if (type === 'sale') items.push({ type, drinkId: drink.id, fromLocationId: locationId, quantity: total });
      if (type === 'transfer') {
        items.push({ type, drinkId: drink.id, fromLocationId: locationId, toLocationId: destinationId, quantity: total });
      }
    }
    return { items };
  }

  function submit(confirmNegative: boolean) {
    const built = buildItems();
    if ('error' in built) {
      setMessage({ kind: 'error', text: built.error });
      return;
    }
    startTransition(async () => {
      try {
        const res = await submitEntry({ batchId, confirmNegative, note: note || undefined, items: built.items });
        if (res.status === 'confirm') {
          setWarnings(res.warnings);
          return;
        }
        setWarnings(null);
        if (res.status === 'error') {
          setMessage({ kind: 'error', text: res.message });
          return;
        }
        setMessage({ kind: 'ok', text: `${res.count}件登録しました` });
        setLines([newLine()]);
        setNote('');
        setBatchId(crypto.randomUUID());
      } catch {
        setMessage({ kind: 'error', text: '通信エラーです。もう一度「登録する」を押してください（二重に登録はされません）' });
      }
    });
  }

  const locationLabel = type === 'transfer' ? '移動元' : '拠点';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded bg-gray-200 p-1">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => {
              resetFeedback();
              setType(t);
            }}
            className={`rounded py-2 text-sm ${type === t ? 'bg-white font-bold shadow' : 'text-gray-600'}`}
          >
            {MOVEMENT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">{locationLabel}</span>
          <select
            value={locationId}
            onChange={(e) => {
              resetFeedback();
              setLocationId(e.target.value);
            }}
            className="w-full rounded border bg-white px-3 py-2"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {type === 'transfer' && (
          <label className="flex-1">
            <span className="mb-1 block text-sm">移動先</span>
            <select
              value={destinationId}
              onChange={(e) => {
                resetFeedback();
                setDestinationId(e.target.value);
              }}
              className="w-full rounded border bg-white px-3 py-2"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {type === 'adjust' && <p className="text-sm text-gray-600">実際に数えた数を入力してください。</p>}

      <ul className="space-y-3">
        {lines.map((line, i) => {
          const drink = drinkById.get(line.drinkId);
          const book = drink ? stockOf(locationId, drink.id) : 0;
          const counted = drink ? toBottles(toInt(line.cases), toInt(line.bottles), drink.unitsPerCase) : 0;
          return (
            <li key={line.key} className="space-y-2 rounded border bg-white p-3">
              <DrinkPicker
                drinks={drinks}
                value={line.drinkId}
                onChange={(id) => updateLine(line.key, { drinkId: id })}
                label={`ドリンク${i + 1}`}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.cases}
                  onChange={(e) => updateLine(line.key, { cases: e.target.value })}
                  aria-label={`ケース${i + 1}`}
                  className="w-20 rounded border px-2 py-2 text-right"
                />
                <span>ケース</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.bottles}
                  onChange={(e) => updateLine(line.key, { bottles: e.target.value })}
                  aria-label={`本${i + 1}`}
                  className="w-20 rounded border px-2 py-2 text-right"
                />
                <span>本</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    className="ml-auto text-sm text-red-600"
                  >
                    削除
                  </button>
                )}
              </div>
              {drink && (
                <p className="text-xs text-gray-600">
                  現在の帳簿: {formatQuantity(book, drink.unitsPerCase)}
                  {type === 'adjust' && ` → 差 ${counted - book >= 0 ? '+' : '−'}${Math.abs(counted - book)}本`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setLines((prev) => [...prev, newLine()])}
        className="w-full rounded border border-dashed py-2 text-sm text-gray-600"
      >
        ＋ ドリンクを追加
      </button>

      <label className="block">
        <span className="mb-1 block text-sm">メモ（任意）</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          className="w-full rounded border px-3 py-2"
        />
      </label>

      {warnings && (
        <div className="space-y-2 rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">
          <p className="font-bold">在庫がマイナスになります。登録してよいですか？</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="rounded bg-yellow-500 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            マイナスでも登録する
          </button>
        </div>
      )}
      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => submit(false)}
        className="w-full rounded bg-blue-600 py-3 font-bold text-white disabled:opacity-50"
      >
        登録する
      </button>
    </div>
  );
}
```

- [ ] **Step 4: ページを書く**

`src/app/(app)/entry/page.tsx`:
```tsx
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { EntryForm } from './EntryForm';

export default async function EntryPage() {
  const staff = await requireStaff();
  const db = getDb();
  const [drinks, locations, levels] = await Promise.all([listDrinks(db), listLocations(db), getStockLevels(db)]);
  if (locations.length === 0) return <p>有効な拠点がありません。管理者に連絡してください。</p>;
  if (drinks.length === 0) return <p>ドリンクが登録されていません。「ドリンク」タブから登録してください。</p>;
  const defaultLocationId = locations.find((l) => l.id === staff.homeLocationId)?.id ?? locations[0].id;
  return <EntryForm drinks={drinks} locations={locations} levels={levels} defaultLocationId={defaultLocationId} />;
}
```

- [ ] **Step 5: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 入荷・販売・移動・棚卸の入力画面を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 履歴・取り消し・CSV 出力

**Files:**
- Create: `src/app/(app)/history/page.tsx`, `src/app/(app)/history/VoidButton.tsx`, `src/app/(app)/history/actions.ts`
- Create: `src/app/api/export/movements/route.ts`, `src/app/api/export/stock/route.ts`

- [ ] **Step 1: 取り消しの Server Action を書く**

`src/app/(app)/history/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import { canVoid } from '@/lib/permissions';
import { getMovementForVoid, voidMovement } from '@/lib/repo/movements';

export async function voidMovementAction(movementId: string): Promise<{ error?: string }> {
  const staff = await requireStaff();
  const db = getDb();
  try {
    const movement = await getMovementForVoid(db, movementId);
    if (!movement) return { error: '記録が見つかりません' };
    if (!canVoid(movement, staff)) {
      return { error: '取り消せるのは自分の入力（24時間以内）だけです。管理者に依頼してください' };
    }
    await voidMovement(db, movementId, staff.id);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return {};
}
```

- [ ] **Step 2: 取り消しボタンを書く**

`src/app/(app)/history/VoidButton.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { voidMovementAction } from './actions';

export function VoidButton({ movementId }: { movementId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm text-red-600 underline">
        取り消し
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await voidMovementAction(movementId);
            if (res.error) setError(res.error);
          })
        }
        className="rounded bg-red-600 px-2 py-1 text-white disabled:opacity-50"
      >
        本当に取り消す
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-gray-600 underline">
        やめる
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 3: 履歴ページを書く**

`src/app/(app)/history/page.tsx`:
```tsx
import { requireStaff } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { describeMovement, MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { movementFilterToQuery, parseMovementFilter } from '@/lib/movementFilter';
import { canVoid } from '@/lib/permissions';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { listMovements } from '@/lib/repo/movements';
import { listStaff } from '@/lib/repo/staff';
import type { MovementType } from '@/lib/types';
import { VoidButton } from './VoidButton';

const PAGE_LIMIT = 200;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const filter = parseMovementFilter(await searchParams);
  const db = getDb();
  const [movements, locations, drinks, staffList] = await Promise.all([
    listMovements(db, filter, PAGE_LIMIT),
    listLocations(db, { includeInactive: true }),
    listDrinks(db, { includeInactive: true }),
    listStaff(db),
  ]);
  const now = new Date();
  const query = movementFilterToQuery(filter);

  return (
    <div className="space-y-4">
      <form className="grid grid-cols-2 gap-2 rounded border bg-white p-3 text-sm sm:grid-cols-3">
        <select name="location" defaultValue={filter.locationId ?? ''} aria-label="拠点" className="rounded border px-2 py-2">
          <option value="">すべての拠点</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="drink" defaultValue={filter.drinkId ?? ''} aria-label="ドリンク" className="rounded border px-2 py-2">
          <option value="">すべてのドリンク</option>
          {drinks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="staff" defaultValue={filter.staffId ?? ''} aria-label="スタッフ" className="rounded border px-2 py-2">
          <option value="">すべてのスタッフ</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={filter.type ?? ''} aria-label="種類" className="rounded border px-2 py-2">
          <option value="">すべての種類</option>
          {(Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[]).map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={filter.fromDate ?? ''} aria-label="開始日" className="rounded border px-2 py-2" />
        <input type="date" name="to" defaultValue={filter.toDate ?? ''} aria-label="終了日" className="rounded border px-2 py-2" />
        <button className="col-span-2 rounded bg-blue-600 py-2 font-bold text-white sm:col-span-3">絞り込む</button>
      </form>

      <div className="flex justify-between text-sm">
        <span className="text-gray-600">
          {movements.length}件{movements.length === PAGE_LIMIT && `（新しい${PAGE_LIMIT}件のみ表示）`}
        </span>
        <a href={`/api/export/movements?${query}`} className="text-blue-700 underline">
          CSV出力
        </a>
      </div>

      <ul className="divide-y rounded border bg-white">
        {movements.map((m) => (
          <li key={m.id} className={`space-y-1 px-3 py-3 ${m.voidedAt ? 'text-gray-400' : ''}`}>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {formatDateTime(m.createdAt)}・{m.staffName}
              </span>
              <span className="rounded bg-gray-100 px-2">{MOVEMENT_TYPE_LABELS[m.type]}</span>
            </div>
            <p className={m.voidedAt ? 'line-through' : ''}>
              <span className="font-bold">{m.drinkName}</span> {describeMovement(m)}
            </p>
            {m.note && <p className="text-sm text-gray-600">メモ: {m.note}</p>}
            {m.voidedAt ? (
              <p className="text-xs">
                取り消し済み（{formatDateTime(m.voidedAt)}・{m.voidedByName}）
              </p>
            ) : (
              canVoid(m, staff, now) && <VoidButton movementId={m.id} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: CSV 出力の Route Handler を書く**

`src/app/api/export/movements/route.ts`:
```ts
import type { NextRequest } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/current';
import { toCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { parseMovementFilter } from '@/lib/movementFilter';
import { listMovements } from '@/lib/repo/movements';

export async function GET(request: NextRequest) {
  if (!(await getCurrentStaff())) return new Response('Unauthorized', { status: 401 });
  const filter = parseMovementFilter(Object.fromEntries(request.nextUrl.searchParams));
  const rows = await listMovements(getDb(), filter, 50000);
  const csv = toCsv(
    ['日時', '種類', 'ドリンク', '移動元', '移動先', '本数（棚卸は差分）', '棚卸の実数', 'メモ', '操作した人', '取り消し日時', '取り消した人'],
    rows.map((m) => [
      formatDateTime(m.createdAt),
      MOVEMENT_TYPE_LABELS[m.type],
      m.drinkName,
      m.fromLocationName,
      m.toLocationName,
      m.quantity,
      m.countedQuantity,
      m.note,
      m.staffName,
      m.voidedAt ? formatDateTime(m.voidedAt) : null,
      m.voidedByName,
    ]),
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="movements.csv"',
    },
  });
}
```

`src/app/api/export/stock/route.ts`:
```ts
import { getCurrentStaff } from '@/lib/auth/current';
import { toCsv } from '@/lib/csv';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (staff.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const db = getDb();
  const [locations, drinks, levels] = await Promise.all([listLocations(db), listDrinks(db), getStockLevels(db)]);
  const qty = new Map(levels.map((l) => [`${l.locationId}:${l.drinkId}`, l.quantity]));
  const csv = toCsv(
    ['ドリンク', '1ケースの本数', ...locations.map((l) => `${l.name}（本）`), '合計（本）'],
    drinks.map((d) => {
      const perLocation = locations.map((l) => qty.get(`${l.id}:${d.id}`) ?? 0);
      return [d.name, d.unitsPerCase, ...perLocation, perLocation.reduce((a, b) => a + b, 0)];
    }),
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="stock.csv"',
    },
  });
}
```

- [ ] **Step 5: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 履歴・取り消し・CSV 出力を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 管理画面（トップ・操作ログ・スタッフ）

**Files:**
- Create: `src/app/(app)/admin/page.tsx`
- Create: `src/app/(app)/admin/staff/page.tsx`, `src/app/(app)/admin/staff/StaffCreateForm.tsx`, `src/app/(app)/admin/staff/actions.ts`
- Create: `src/app/(app)/admin/staff/[id]/page.tsx`, `src/app/(app)/admin/staff/[id]/StaffEditForms.tsx`

- [ ] **Step 1: 管理トップ（操作ログつき）を書く**

`src/app/(app)/admin/page.tsx`:
```tsx
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { listAuditLogs } from '@/lib/repo/audit';

const ACTION_LABELS: Record<string, string> = {
  'staff.create': 'スタッフ登録',
  'staff.update': 'スタッフ変更',
  'staff.reset_pin': 'PINリセット',
  'staff.unlock': 'ロック解除',
  'drink.create': 'ドリンク登録',
  'drink.deactivate': 'ドリンク廃止',
  'drink.activate': 'ドリンク復活',
  'location.create': '拠点追加',
  'location.update': '拠点変更',
  'movement.void': '在庫記録の取り消し',
  'login.locked': 'PIN誤りでロック',
};

export default async function AdminPage() {
  await requireAdmin();
  const logs = await listAuditLogs(getDb(), 100);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/staff" className="rounded border bg-white p-4 text-center font-bold">
          スタッフ管理
        </Link>
        <Link href="/admin/locations" className="rounded border bg-white p-4 text-center font-bold">
          拠点管理
        </Link>
      </div>
      <a href="/api/export/stock" className="block text-sm text-blue-700 underline">
        在庫一覧をCSV出力
      </a>
      <h2 className="font-bold">操作ログ（新しい100件）</h2>
      <ul className="divide-y rounded border bg-white text-sm">
        {logs.map((log) => (
          <li key={log.id} className="px-3 py-2">
            <span className="text-xs text-gray-500">{formatDateTime(log.createdAt)}</span>{' '}
            <span className="font-bold">{log.staffName ?? 'システム'}</span>{' '}
            {ACTION_LABELS[log.action] ?? log.action}
            {typeof log.details.name === 'string' && `：${log.details.name}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: スタッフ管理の Server Action を書く**

`src/app/(app)/admin/staff/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createStaff, resetPin, unlockStaff, updateStaff } from '@/lib/repo/staff';
import { pinSchema, staffCreateSchema, staffUpdateSchema } from '@/lib/validation';

const optionalId = (v: FormDataEntryValue | null) => (typeof v === 'string' && v !== '' ? v : null);

export async function createStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = staffCreateSchema.safeParse({
    name: formData.get('name'),
    pin: formData.get('pin'),
    role: formData.get('role'),
    homeLocationId: optionalId(formData.get('homeLocationId')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createStaff(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: `${parsed.data.name} を登録しました` };
}

export async function updateStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = staffUpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    role: formData.get('role'),
    homeLocationId: optionalId(formData.get('homeLocationId')),
    isActive: formData.get('isActive') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateStaff(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: '保存しました' };
}

export async function resetPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const pin = pinSchema.safeParse(formData.get('pin'));
  if (!pin.success) return { error: pin.error.issues[0].message };
  try {
    await resetPin(getDb(), admin.id, id, pin.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: 'PINを変更し、ロックを解除しました' };
}

export async function unlockStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await unlockStaff(getDb(), admin.id, String(formData.get('id') ?? ''));
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: 'ロックを解除しました' };
}
```

- [ ] **Step 3: スタッフ登録フォームと一覧を書く**

`src/app/(app)/admin/staff/StaffCreateForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Location } from '@/lib/types';
import { createStaffAction } from './actions';

export function StaffCreateForm({ locations }: { locations: Location[] }) {
  const [state, formAction, pending] = useActionState(createStaffAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">スタッフを登録</h2>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="mb-1 block text-sm">名前</span>
          <input name="name" required maxLength={50} className="w-full rounded border px-3 py-2" />
        </label>
        <label>
          <span className="mb-1 block text-sm">PIN</span>
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4,6}"
            required
            placeholder="4〜6桁"
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm">権限</span>
          <select name="role" defaultValue="staff" className="w-full rounded border bg-white px-3 py-2">
            <option value="staff">スタッフ</option>
            <option value="admin">管理者</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm">所属拠点</span>
          <select name="homeLocationId" defaultValue="" className="w-full rounded border bg-white px-3 py-2">
            <option value="">なし</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        登録
      </button>
    </form>
  );
}
```

`src/app/(app)/admin/staff/page.tsx`:
```tsx
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { listStaff } from '@/lib/repo/staff';
import { StaffCreateForm } from './StaffCreateForm';

export default async function StaffAdminPage() {
  await requireAdmin();
  const db = getDb();
  const [staff, locations] = await Promise.all([listStaff(db), listLocations(db, { includeInactive: true })]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const now = Date.now();
  return (
    <div className="space-y-4">
      <StaffCreateForm locations={locations.filter((l) => l.isActive)} />
      <ul className="divide-y rounded border bg-white">
        {staff.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/staff/${s.id}`} className="flex items-center justify-between px-3 py-3">
              <span className={s.isActive ? '' : 'text-gray-400 line-through'}>
                {s.name}
                <span className="ml-2 text-xs text-gray-500">
                  {s.role === 'admin' ? '管理者' : 'スタッフ'}
                  {s.homeLocationId && `・${locationName.get(s.homeLocationId)}`}
                </span>
              </span>
              {s.lockedUntil && s.lockedUntil.getTime() > now && (
                <span className="rounded bg-red-100 px-2 text-xs text-red-700">ロック中</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: スタッフ編集ページを書く**

`src/app/(app)/admin/staff/[id]/StaffEditForms.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/formState';
import type { Location, Staff } from '@/lib/types';
import { resetPinAction, unlockStaffAction, updateStaffAction } from '../actions';

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700">{state.message}</p>;
  return null;
}

export function StaffEditForms({ staff, locations, isLocked }: { staff: Staff; locations: Location[]; isLocked: boolean }) {
  const [updateState, updateAction, updating] = useActionState(updateStaffAction, initialFormState);
  const [pinState, pinAction, resetting] = useActionState(resetPinAction, initialFormState);
  const [unlockState, unlockAction, unlocking] = useActionState(unlockStaffAction, initialFormState);

  return (
    <div className="space-y-4">
      <form action={updateAction} className="space-y-3 rounded border bg-white p-4">
        <input type="hidden" name="id" value={staff.id} />
        <label className="block">
          <span className="mb-1 block text-sm">名前</span>
          <input name="name" defaultValue={staff.name} required maxLength={50} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">権限</span>
          <select name="role" defaultValue={staff.role} className="w-full rounded border bg-white px-3 py-2">
            <option value="staff">スタッフ</option>
            <option value="admin">管理者</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">所属拠点</span>
          <select
            name="homeLocationId"
            defaultValue={staff.homeLocationId ?? ''}
            className="w-full rounded border bg-white px-3 py-2"
          >
            <option value="">なし</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={staff.isActive} />
          <span className="text-sm">有効（外すとログインできなくなります）</span>
        </label>
        <Feedback state={updateState} />
        <button disabled={updating} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
          保存
        </button>
      </form>

      <form action={pinAction} className="space-y-3 rounded border bg-white p-4">
        <input type="hidden" name="id" value={staff.id} />
        <label className="block">
          <span className="mb-1 block text-sm">新しいPIN</span>
          <input name="pin" inputMode="numeric" pattern="\d{4,6}" required className="w-full rounded border px-3 py-2" />
        </label>
        <Feedback state={pinState} />
        <button disabled={resetting} className="rounded bg-gray-700 px-4 py-2 font-bold text-white disabled:opacity-50">
          PINを変更
        </button>
      </form>

      {isLocked && (
        <form action={unlockAction} className="space-y-3 rounded border border-red-300 bg-white p-4">
          <input type="hidden" name="id" value={staff.id} />
          <p className="text-sm text-red-700">PINを5回間違えたためロックされています。</p>
          <Feedback state={unlockState} />
          <button disabled={unlocking} className="rounded bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">
            ロックを解除
          </button>
        </form>
      )}
    </div>
  );
}
```

`src/app/(app)/admin/staff/[id]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { getStaffById } from '@/lib/repo/staff';
import { StaffEditForms } from './StaffEditForms';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const db = getDb();
  const [staff, locations] = await Promise.all([getStaffById(db, id), listLocations(db)]);
  if (!staff) notFound();
  const isLocked = staff.lockedUntil !== null && staff.lockedUntil.getTime() > Date.now();
  return (
    <div className="space-y-4">
      <Link href="/admin/staff" className="text-sm text-blue-700 underline">
        ← スタッフ一覧
      </Link>
      <h1 className="text-lg font-bold">{staff.name}</h1>
      <StaffEditForms staff={staff} locations={locations} isLocked={isLocked} />
    </div>
  );
}
```

- [ ] **Step 5: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 管理画面（操作ログ・スタッフ管理）を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 拠点管理

**Files:**
- Create: `src/app/(app)/admin/locations/page.tsx`, `src/app/(app)/admin/locations/LocationForms.tsx`, `src/app/(app)/admin/locations/actions.ts`

- [ ] **Step 1: Server Action を書く**

`src/app/(app)/admin/locations/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createLocation, updateLocation } from '@/lib/repo/locations';
import { locationSchema } from '@/lib/validation';

export async function createLocationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = locationSchema.safeParse({ name: formData.get('name'), sortOrder: formData.get('sortOrder') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createLocation(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: `${parsed.data.name} を追加しました` };
}

export async function updateLocationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = locationSchema.safeParse({ name: formData.get('name'), sortOrder: formData.get('sortOrder') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateLocation(getDb(), admin.id, {
      id: String(formData.get('id') ?? ''),
      ...parsed.data,
      isActive: formData.get('isActive') === 'on',
    });
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: '保存しました' };
}
```

- [ ] **Step 2: フォームを書く**

`src/app/(app)/admin/locations/LocationForms.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Location } from '@/lib/types';
import { createLocationAction, updateLocationAction } from './actions';

export function LocationCreateForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, formAction, pending] = useActionState(createLocationAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">拠点を追加</h2>
      <div className="flex gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">拠点名</span>
          <input name="name" required maxLength={50} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="w-24">
          <span className="mb-1 block text-sm">表示順</span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={nextSortOrder}
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        追加
      </button>
    </form>
  );
}

export function LocationEditForm({ location }: { location: Location }) {
  const [state, formAction, pending] = useActionState(updateLocationAction, initialFormState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 px-3 py-3">
      <input type="hidden" name="id" value={location.id} />
      <label className="flex-1">
        <span className="block text-xs text-gray-500">拠点名</span>
        <input name="name" defaultValue={location.name} required maxLength={50} className="w-full rounded border px-2 py-1" />
      </label>
      <label className="w-20">
        <span className="block text-xs text-gray-500">表示順</span>
        <input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={location.sortOrder}
          className="w-full rounded border px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={location.isActive} />
        有効
      </label>
      <button disabled={pending} className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-50">
        保存
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="w-full text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
```

- [ ] **Step 3: ページを書く**

`src/app/(app)/admin/locations/page.tsx`:
```tsx
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { LocationCreateForm, LocationEditForm } from './LocationForms';

export default async function LocationsAdminPage() {
  await requireAdmin();
  const locations = await listLocations(getDb(), { includeInactive: true });
  const nextSortOrder = Math.max(0, ...locations.map((l) => l.sortOrder)) + 1;
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← 管理
      </Link>
      <LocationCreateForm nextSortOrder={nextSortOrder} />
      <p className="text-xs text-gray-600">
        無効にした拠点は入力や在庫一覧に表示されなくなります（過去の記録は残ります）。
      </p>
      <ul className="divide-y rounded border bg-white">
        {locations.map((l) => (
          <li key={l.id}>
            <LocationEditForm location={l} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: ビルドを確認する**

Run: `npm run typecheck && npm run build`
Expected: どちらも成功

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 拠点管理画面を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: E2E テスト（Playwright + PGlite）

**Files:**
- Create: `scripts/e2e-db.ts`, `playwright.config.ts`, `e2e/inventory.spec.ts`

- [ ] **Step 1: E2E 用 DB サーバーのスクリプトを書く**

`scripts/e2e-db.ts`:
```ts
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { runMigrations } from '../src/lib/db/migrate';
import { wrapPglite } from '../src/lib/db/pglite';
import { createStaff } from '../src/lib/repo/staff';

const PORT = Number(process.env.E2E_DB_PORT ?? 55432);

const pg = await PGlite.create();
const db = wrapPglite(pg);
await runMigrations(db);
const [office] = await db.query<{ id: string }>(`select id from locations where name = '事務所'`);
await createStaff(db, null, { name: '管理者', pin: '1234', role: 'admin', homeLocationId: office.id });

const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`e2e db ready on ${PORT}`);
```

- [ ] **Step 2: Playwright の設定を書く**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

const DB_PORT = 55432;
const APP_PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    ...devices['Pixel 7'],
  },
  webServer: [
    {
      command: 'npx tsx scripts/e2e-db.ts',
      port: DB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next dev --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`,
        SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
        DB_POOL_MAX: '1',
      },
    },
  ],
});
```

- [ ] **Step 3: ブラウザをインストールする**

Run: `npx playwright install chromium`
Expected: ダウンロードが完了する

- [ ] **Step 4: E2E テストを書く**

`e2e/inventory.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string, pin: string) {
  await page.goto('/login');
  await page.getByLabel('名前').selectOption({ label: name });
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('link', { name: '在庫', exact: true })).toBeVisible();
}

test('receive, transfer, check stock and void', async ({ page }) => {
  await login(page, '管理者', '1234');

  // Register a drink
  await page.getByRole('link', { name: 'ドリンク', exact: true }).click();
  await page.getByLabel('ドリンク名').fill('コーラ');
  await page.getByLabel('1ケースの本数').fill('24');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('コーラ を登録しました')).toBeVisible();

  // Receive 2 cases at 事務所 (the admin's home location)
  await page.getByRole('link', { name: '入力', exact: true }).click();
  await page.getByLabel('ドリンク1', { exact: true }).selectOption({ label: 'コーラ' });
  await page.getByLabel('ケース1').fill('2');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('1件登録しました')).toBeVisible();

  // Transfer 5 bottles to Kingyo
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await page.getByLabel('移動先').selectOption({ label: 'Kingyo' });
  await page.getByLabel('ドリンク1', { exact: true }).selectOption({ label: 'コーラ' });
  await page.getByLabel('本1').fill('5');
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByText('1件登録しました')).toBeVisible();

  // Check stock
  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByText('1ケース＋19本（計43本）')).toBeVisible();
  await page.getByLabel('表示する拠点').selectOption({ label: 'Kingyo' });
  await expect(page.getByText('5本')).toBeVisible();

  // Search across all locations
  await page.getByLabel('表示する拠点').selectOption({ label: '全拠点' });
  await page.getByLabel('検索').fill('こーら');
  await expect(page.getByRole('cell', { name: '計48本' })).toBeVisible();

  // Void the transfer (newest entry)
  await page.getByRole('link', { name: '履歴', exact: true }).click();
  await page.getByRole('button', { name: '取り消し' }).first().click();
  await page.getByRole('button', { name: '本当に取り消す' }).click();
  await expect(page.getByText(/取り消し済み/)).toBeVisible();

  await page.getByRole('link', { name: '在庫', exact: true }).click();
  await expect(page.getByText('2ケース（計48本）')).toBeVisible();
});

test('staff cannot see the admin area', async ({ page }) => {
  await login(page, '管理者', '1234');
  await page.getByRole('link', { name: '管理', exact: true }).click();
  await page.getByRole('link', { name: 'スタッフ管理' }).click();
  await page.getByLabel('名前').fill('花子');
  await page.getByLabel('PIN').fill('5678');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('花子 を登録しました')).toBeVisible();
  await page.getByRole('button', { name: 'ログアウト' }).click();

  await login(page, '花子', '5678');
  await expect(page.getByRole('link', { name: '管理', exact: true })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
});
```

- [ ] **Step 5: E2E テストを実行する**

Run: `npm run test:e2e`
Expected: 2 件 PASS

うまくいかない場合の確認ポイント:
- `postgres` ドライバが pglite-socket に接続できない → `playwright.config.ts` の `DATABASE_URL` から `?sslmode=disable` を外して再実行する。それでも駄目なら `scripts/e2e-db.ts` を単体で起動し（`npx tsx scripts/e2e-db.ts`）、別ターミナルで `DATABASE_URL=... npx tsx -e "import('./src/lib/db/postgres.ts').then(async m=>console.log(await m.createPostgresDb(process.env.DATABASE_URL).query('select 1 as x')))"` で接続を確かめる
- 画面の要素が見つからない → `npx playwright test --headed` で実際の画面を見て、ラベルがこの計画の通りか確認する

- [ ] **Step 6: ユニットテストも含めて全体を確認する**

Run: `npm test && npm run typecheck`
Expected: すべて PASS、型エラーなし

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: Playwright + PGlite による E2E テストを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Supabase と Vercel への公開

ユーザーの操作が必要なステップを含む。**[ユーザー]** と書いたステップは、実行する前にユーザーに頼んで結果を待つ。

**Files:**
- Create: `vercel.json`, `README.md`

- [ ] **Step 1: [ユーザー] Supabase のプロジェクトを作る**

ユーザーに次のように頼む:
1. https://supabase.com でプロジェクトを作る（Region は Northeast Asia (Tokyo)。DB のパスワードは控えておく）
2. プロジェクトの「Connect」ボタン → 「Transaction pooler」の接続文字列（ポート 6543）をコピーする。`[YOUR-PASSWORD]` の部分は自分のパスワードに置き換える
3. プロジェクト直下に `.env.local` を作り、次を書く（`SESSION_SECRET` は Step 2 で作る）:
```
DATABASE_URL=（コピーした接続文字列）
```

- [ ] **Step 2: セッション用の秘密鍵を作る**

Run: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
表示された文字列を、`.env.local` に `SESSION_SECRET=...` として追記する。

- [ ] **Step 3: マイグレーションを適用する**

Run: `npm run db:migrate`
Expected: `applied: 0001_schema.sql, 0002_stock_functions.sql, 0003_seed_locations.sql, 0004_lockdown.sql`

- [ ] **Step 4: [ユーザー] 最初の管理者を作る**

管理者の名前と PIN をユーザーに聞いてから実行する:
Run: `npm run db:create-admin -- <名前> <PIN> 事務所`
Expected: `created admin: <名前> (...)`

- [ ] **Step 5: ローカルで本番 DB につないで動作を確認する**

Run: `npm run dev`
ブラウザで http://localhost:3000 を開き、管理者でログインできること、在庫・入力・履歴・ドリンク・管理の各タブが表示されることを確認する。確認したら dev サーバーを止める。

- [ ] **Step 6: Vercel の設定ファイルと README を書く**

`vercel.json`:
```json
{
  "regions": ["hnd1"]
}
```

`README.md`:
````markdown
# ドリンク在庫管理

事務所・各店舗のドリンク在庫を、入荷・販売・移動・棚卸で管理する Web アプリ。

## 開発

```bash
npm install
cp .env.example .env.local   # DATABASE_URL と SESSION_SECRET を設定
npm run db:migrate
npm run db:create-admin -- 名前 1234 事務所
npm run dev
```

## テスト

```bash
npm test          # ユニット + DB（PGlite。Docker 不要）
npm run test:e2e  # Playwright（PGlite を DB サーバーとして起動）
```

## 本番

- DB: Supabase（Transaction pooler の接続文字列を `DATABASE_URL` に設定）
- ホスティング: Vercel（環境変数 `DATABASE_URL`, `SESSION_SECRET`）
- スキーマ変更: `db/migrations/` に連番の SQL を追加し、`npm run db:migrate`
````

- [ ] **Step 7: Commit**

```bash
git add vercel.json README.md
git commit -m "chore: Vercel の設定と README を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: [ユーザー] Vercel にデプロイする**

GitHub にリポジトリを作って push するか、`npx vercel` で直接デプロイするかをユーザーに選んでもらう。どちらの場合も、Vercel のプロジェクト設定 → Environment Variables に `DATABASE_URL` と `SESSION_SECRET`（`.env.local` と同じ値）を Production に登録してからデプロイする。

- [ ] **Step 9: 本番で動作を確認する**

公開 URL をスマホで開き、次を確認する:
- 管理者でログインできる
- ドリンクを 1 つ登録し、入荷 → 在庫に反映される
- 履歴で取り消せる
- 管理 → 操作ログに記録が出る

確認に使ったテスト用のデータは、ドリンクを廃止し、入荷記録を取り消して片付ける。

---

## Self-Review メモ（計画作成時に確認済み）

- 設計書との対応: 拠点 5 つ（Task 2）/ PIN ログイン・ロック（Task 8, 9, 11）/ ケース + バラ（Task 5, 14）/ 入荷・販売・移動・棚卸（Task 3, 14）/ 在庫マイナス確認（Task 7, 14）/ 取り消しルール（Task 6, 15）/ ドリンク登録は全員・廃止は管理者（Task 13）/ 全拠点一覧・検索（Task 12）/ CSV（Task 15）/ スタッフ・拠点管理（Task 16, 17）/ 操作ログ（Task 9, 16）/ 冪等性・アドバイザリロック（Task 3, 14）/ RLS（Task 4）/ 公開（Task 19）
- 対象外（金額・在庫が少ないときの警告・B モード・カテゴリ・＋1 ボタン）は実装しない
