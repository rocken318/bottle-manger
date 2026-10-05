# キープボトル管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在庫管理アプリの `/keep` 配下に、お客様のキープボトルを登録・一覧・期限管理できる別の入り口を作る。ボトル入力は `drinks` を検索して選ぶ。

**Architecture:** 新テーブル `keep_bottles`（`drinks` への外部キー＋名前のコピー）、純粋関数の `src/lib/keep.ts`、DB 操作の `src/lib/repo/keepBottles.ts`、専用レイアウトの `src/app/(keep)/keep/` を足す。認証は既存の `requireStaff()` を使い、検索は既存の `normalizeForSearch` と `categoryFilter.ts` を再利用する。

**Tech Stack:** Next.js 16（App Router、Server Actions）、React 19、postgres.js、zod 4、vitest 5（PGlite）、Playwright、Tailwind 4。

**Spec:** `docs/superpowers/specs/2026-10-05-keep-bottles-design.md`

## Global Constraints

- 期限は最終利用日から **180 日**。定数 `KEEP_EXPIRY_DAYS = 180` を `src/lib/keep.ts` の 1 か所にだけ置く。
- バナーは「期限まで 30 日以内（超過を含む）」のボトル数。定数 `KEEP_WARN_DAYS = 30`。
- 日付の「今日」は Asia/Tokyo。`date` 列は SQL 側で `to_char(..., 'YYYY-MM-DD')` の文字列にして返す（タイムゾーンずれを避ける）。
- メモは 500 字まで。お客様名は 1〜50 字。
- 新しい認証は足さない。ページと Server Action はすべて `requireStaff()` を通す。
- 新テーブルは `0008_categories.sql` と同じロックダウン（RLS 有効＋ anon/authenticated を revoke）。
- コード・画面の文言は既存に合わせる（日本語、Tailwind、`submitWithoutReset` と `useActionState` の組み合わせ、`FormState`）。
- この Next.js は従来と異なる。画面・Server Action を書く前に `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` と `07-mutating-data.md` を読む。既存の `(app)` 配下と同じ書き方に合わせれば足りる。
- コミットメッセージの末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける。

## Review Focus

- 日本時間の 0 時をまたぐ：UTC で前日でも日本ではもう翌日。「今日」は日本時間で数える（Task 1 のテスト）。
- 期限ちょうどの日：最終利用日から 180 日目は「あと0日」（まだ超過ではない）、181 日目は「1日超過」（Task 1 のテスト）。
- お客様名検索の表記ゆれ：全角・半角、ひらがな・カタカナ、スペースの有無で同じ人が見つかる（Task 1 のテスト）。
- 廃止されたお酒で登録しようとする：拒否する。すでにある登録は `drink_name` のコピーで表示し続ける（Task 2 のテスト）。
- 期限切れのボトルへの操作：最終利用日の更新、メモ編集、もう一度の期限切れは拒否する。存在しない id も同様（Task 2 のテスト）。
- 登録日が未来：最終利用日は登録日と同じ。今日で更新しても最終利用日が登録日より前にならず、DB の check 制約に違反しない（Task 2 のテスト）。

## File Structure

| ファイル | 役割 |
| --- | --- |
| `db/migrations/0009_keep_bottles.sql`（新規） | `keep_bottles` テーブルとロックダウン |
| `src/lib/types.ts`（変更） | `KeepBottle` 型 |
| `src/lib/keep.ts`（新規） | 期限の定数、日付計算、表示ラベル、お客様名検索（純粋関数） |
| `src/lib/repo/keepBottles.ts`（新規） | 一覧・登録・最終利用日更新・メモ更新・期限切れにする |
| `src/lib/errors.ts`（変更） | 新しいエラーコードの日本語メッセージ |
| `src/lib/validation.ts`（変更） | キープ用の zod スキーマ |
| `src/app/(app)/admin/page.tsx`（変更） | 監査ログのラベルにキープの操作を足す |
| `src/app/(keep)/layout.tsx`（新規） | キープ専用レイアウト（ヘッダー・ナビ） |
| `src/app/(keep)/KeepNav.tsx`（新規） | キープ専用の下部ナビ |
| `src/app/(keep)/keep/page.tsx`（新規） | 一覧ページ（サーバー側でデータ取得） |
| `src/app/(keep)/keep/KeepList.tsx`（新規） | タブ・検索・バナー・行の一覧（クライアント） |
| `src/app/(keep)/keep/KeepRow.tsx`（新規） | 1 件分の表示と操作（最終利用日更新・メモ・期限切れ） |
| `src/app/(keep)/keep/actions.ts`（新規） | Server Actions |
| `src/app/(keep)/keep/new/page.tsx`（新規） | 登録ページ |
| `src/app/(keep)/keep/new/KeepForm.tsx`（新規） | 登録フォーム |
| `src/app/(keep)/keep/new/DrinkPicker.tsx`（新規） | お酒の検索付き単一選択 |
| `src/app/(app)/layout.tsx`（変更） | ヘッダーに「キープ」への行き来用リンク |
| `tests/unit/keep.test.ts`、`tests/unit/keepValidation.test.ts`、`tests/db/keepBottles.test.ts`、`e2e/keep.spec.ts`（新規） | テスト |

---

### Task 1: 期限と検索の純粋関数

**Files:**
- Create: `src/lib/keep.ts`
- Test: `tests/unit/keep.test.ts`

**Interfaces:**
- Produces（後続のタスクが使う）:
  - `KEEP_EXPIRY_DAYS: 180`、`KEEP_WARN_DAYS: 30`
  - `todayJst(now?: Date): string` — `YYYY-MM-DD`
  - `daysRemaining(lastUsedOn: string, today: string): number` — 180 − 経過日数
  - `expiryLabel(remaining: number): string` — `あと◯日` または `◯日超過`
  - `isExpired(remaining: number): boolean` — `remaining <= 0`（赤く表示する条件）
  - `countNearExpiry(bottles: { lastUsedOn: string }[], today: string): number` — 残り 30 日以内（超過を含む）の数
  - `filterByCustomer<T extends { customerName: string }>(bottles: T[], query: string): T[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/keep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  KEEP_EXPIRY_DAYS,
  countNearExpiry,
  daysRemaining,
  expiryLabel,
  filterByCustomer,
  isExpired,
  todayJst,
} from '@/lib/keep';

describe('keep', () => {
  it('expires after 180 days', () => {
    expect(KEEP_EXPIRY_DAYS).toBe(180);
  });

  it('takes "today" in Japan time, across the UTC midnight', () => {
    // 2026-10-05 15:30 UTC は日本ではもう 10/06 の 0:30
    expect(todayJst(new Date('2026-10-05T15:30:00Z'))).toBe('2026-10-06');
    expect(todayJst(new Date('2026-10-05T14:59:00Z'))).toBe('2026-10-05');
  });

  it('counts remaining days, with day 180 still valid and day 181 over', () => {
    expect(daysRemaining('2026-10-05', '2026-10-05')).toBe(180);
    expect(daysRemaining('2026-10-01', '2026-10-05')).toBe(176); // 経過 4 日
    // 最終利用日から 180 日目 = あと0日、181 日目 = 1日超過
    expect(daysRemaining('2026-01-01', '2026-06-30')).toBe(0);
    expect(daysRemaining('2026-01-01', '2026-07-01')).toBe(-1);
  });

  it('labels remaining and overdue days', () => {
    expect(expiryLabel(12)).toBe('あと12日');
    expect(expiryLabel(0)).toBe('あと0日');
    expect(expiryLabel(-3)).toBe('3日超過');
  });

  it('marks 0 days or less as expired', () => {
    expect(isExpired(1)).toBe(false);
    expect(isExpired(0)).toBe(true);
    expect(isExpired(-5)).toBe(true);
  });

  it('counts bottles within 30 days of expiry, overdue ones included', () => {
    const today = '2026-10-05';
    const bottles = [
      { lastUsedOn: '2026-10-05' }, // 残り 180
      { lastUsedOn: '2026-05-09' }, // 経過 149 → 残り 31
      { lastUsedOn: '2026-05-08' }, // 経過 150 → 残り 30
      { lastUsedOn: '2025-01-01' }, // 超過
    ];
    expect(countNearExpiry(bottles, today)).toBe(2);
  });

  it('finds customers regardless of width, kana type and spaces', () => {
    const rows = [{ customerName: 'タナカ ヒロシ' }, { customerName: '佐藤' }];
    expect(filterByCustomer(rows, 'たなか')).toEqual([rows[0]]);
    expect(filterByCustomer(rows, 'ﾀﾅｶ')).toEqual([rows[0]]);
    expect(filterByCustomer(rows, 'ひろし')).toEqual([rows[0]]);
    expect(filterByCustomer(rows, '  ')).toEqual(rows);
    expect(filterByCustomer(rows, 'ほげ')).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/unit/keep.test.ts`
Expected: FAIL（`@/lib/keep` が見つからない）

- [ ] **Step 3: 実装する**

`src/lib/keep.ts`:

```ts
import { matchesSearch } from './search';

/** キープの期限。最終利用日からこの日数。 */
export const KEEP_EXPIRY_DAYS = 180;
/** 一覧上部のバナーを出す「期限まであと◯日以内」。 */
export const KEEP_WARN_DAYS = 30;

const jstDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 日本時間の今日（YYYY-MM-DD）。 */
export function todayJst(now: Date = new Date()): string {
  return jstDateParts.format(now);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 期限までの残り日数。0 は期限の当日、負は超過。 */
export function daysRemaining(lastUsedOn: string, today: string): number {
  const elapsed = Math.round((ymdToUtcMs(today) - ymdToUtcMs(lastUsedOn)) / DAY_MS);
  return KEEP_EXPIRY_DAYS - elapsed;
}

export function expiryLabel(remaining: number): string {
  return remaining >= 0 ? `あと${remaining}日` : `${-remaining}日超過`;
}

/** 0 日以下は赤く表示する。 */
export function isExpired(remaining: number): boolean {
  return remaining <= 0;
}

/** 期限まで KEEP_WARN_DAYS 日以内（超過を含む）のキープ中ボトルの数。 */
export function countNearExpiry(bottles: { lastUsedOn: string }[], today: string): number {
  return bottles.filter((b) => daysRemaining(b.lastUsedOn, today) <= KEEP_WARN_DAYS).length;
}

export function filterByCustomer<T extends { customerName: string }>(bottles: T[], query: string): T[] {
  return bottles.filter((b) => matchesSearch(b.customerName, query));
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run tests/unit/keep.test.ts`
Expected: PASS（7 件）。落ちたら、テスト中の日付の数え違いを計算し直す（`2026-01-01` から `2026-06-30` は 180 日）。

- [ ] **Step 5: コミット**

```bash
git add src/lib/keep.ts tests/unit/keep.test.ts
git commit -m "feat: キープの期限計算と検索の関数を足す" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: テーブルとリポジトリ

**Files:**
- Create: `db/migrations/0009_keep_bottles.sql`
- Create: `src/lib/repo/keepBottles.ts`
- Modify: `src/lib/types.ts`（末尾に `KeepBottle` を足す）
- Modify: `src/lib/errors.ts`（`MESSAGES` に 2 行足す）
- Modify: `src/app/(app)/admin/page.tsx`（監査ログのラベルに 4 行足す）
- Test: `tests/db/keepBottles.test.ts`

**Interfaces:**
- Produces:
  - `type KeepBottle = { id: string; customerName: string; drinkId: string; drinkName: string; registeredOn: string; lastUsedOn: string; status: 'active' | 'dropped'; droppedOn: string | null; note: string; createdAt: Date }`
  - `listKeepBottles(db: Db, status: 'active' | 'dropped'): Promise<KeepBottle[]>` — キープ中は最終利用日の古い順、期限切れは期限切れにした日の新しい順
  - `createKeepBottle(db: Db, actorId: string, input: { customerName: string; drinkId: string; registeredOn: string; note: string }): Promise<KeepBottle>` — エラー: `drink_not_found`、`inactive_drink`
  - `touchKeepBottle(db: Db, actorId: string, id: string, today: string): Promise<void>`
  - `updateKeepNote(db: Db, actorId: string, id: string, note: string): Promise<void>`
  - `dropKeepBottle(db: Db, actorId: string, id: string, today: string): Promise<void>`
  - この 3 つのエラー: `keep_not_found`、`keep_not_active`
  - 監査ログの action: `keep.create`、`keep.touch`、`keep.note`、`keep.drop`

- [ ] **Step 1: マイグレーションを書く**

`db/migrations/0009_keep_bottles.sql`:

```sql
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
```

- [ ] **Step 2: 型・エラー・監査ラベルを足す**

`src/lib/types.ts` の末尾に追記:

```ts
/** お客様のキープボトル。日付は YYYY-MM-DD の文字列（日本の暦日）。 */
export interface KeepBottle {
  id: string;
  customerName: string;
  drinkId: string;
  /** 登録時点のお酒の名前。drinks 側を直しても変わらない。 */
  drinkName: string;
  registeredOn: string;
  lastUsedOn: string;
  status: 'active' | 'dropped';
  droppedOn: string | null;
  note: string;
  createdAt: Date;
}
```

`src/lib/errors.ts` の `MESSAGES` の `price_not_found` の行の下に足す:

```ts
  keep_not_found: 'キープボトルが見つかりません',
  keep_not_active: 'このキープボトルはすでに期限切れです',
```

`src/app/(app)/admin/page.tsx` のラベル表の `'settings.update': '原価の設定変更',` の下に足す:

```ts
  'keep.create': 'キープ登録',
  'keep.touch': 'キープの最終利用日更新',
  'keep.note': 'キープのメモ変更',
  'keep.drop': 'キープ期限切れ',
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/db/keepBottles.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { listAuditLogs } from '@/lib/repo/audit';
import {
  createKeepBottle,
  dropKeepBottle,
  listKeepBottles,
  touchKeepBottle,
  updateKeepNote,
} from '@/lib/repo/keepBottles';
import { createTestDb, insertDrink, insertStaff } from '../helpers/testDb';

let db: Db;
let staffId: string;
let drinkId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
  drinkId = await insertDrink(db, '白州');
});

const input = (over: Partial<Parameters<typeof createKeepBottle>[2]> = {}) => ({
  customerName: '田中様',
  drinkId,
  registeredOn: '2026-10-01',
  note: '',
  ...over,
});

describe('keep bottles repository', () => {
  it('creates a bottle with the drink name copied and last use = registration date', async () => {
    const b = await createKeepBottle(db, staffId, input({ note: '氷多め' }));
    expect(b).toMatchObject({
      customerName: '田中様',
      drinkId,
      drinkName: '白州',
      registeredOn: '2026-10-01',
      lastUsedOn: '2026-10-01',
      status: 'active',
      droppedOn: null,
      note: '氷多め',
    });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'keep.create', targetId: b.id });
  });

  it('rejects an unknown or deactivated drink', async () => {
    await expect(
      createKeepBottle(db, staffId, input({ drinkId: '00000000-0000-4000-8000-000000000000' })),
    ).rejects.toThrow('drink_not_found');
    await db.query('update drinks set is_active = false where id = $1', [drinkId]);
    await expect(createKeepBottle(db, staffId, input())).rejects.toThrow('inactive_drink');
  });

  it('keeps showing the copied name after the drink is renamed or deactivated', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await db.query(`update drinks set name = '白州12年', is_active = false where id = $1`, [drinkId]);
    const [row] = await listKeepBottles(db, 'active');
    expect(row).toMatchObject({ id: b.id, drinkName: '白州' });
  });

  it('lists active bottles oldest last use first, and dropped ones newest drop first', async () => {
    const a = await createKeepBottle(db, staffId, input({ customerName: 'A', registeredOn: '2026-09-01' }));
    const b = await createKeepBottle(db, staffId, input({ customerName: 'B', registeredOn: '2026-08-01' }));
    const c = await createKeepBottle(db, staffId, input({ customerName: 'C', registeredOn: '2026-07-01' }));
    expect((await listKeepBottles(db, 'active')).map((x) => x.id)).toEqual([c.id, b.id, a.id]);

    await dropKeepBottle(db, staffId, c.id, '2026-10-01');
    await dropKeepBottle(db, staffId, a.id, '2026-10-03');
    expect((await listKeepBottles(db, 'active')).map((x) => x.id)).toEqual([b.id]);
    expect((await listKeepBottles(db, 'dropped')).map((x) => x.id)).toEqual([a.id, c.id]);
    expect((await listKeepBottles(db, 'dropped'))[0]).toMatchObject({ status: 'dropped', droppedOn: '2026-10-03' });
  });

  it('touches the last use date and logs it', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await touchKeepBottle(db, staffId, b.id, '2026-10-05');
    expect((await listKeepBottles(db, 'active'))[0]).toMatchObject({ lastUsedOn: '2026-10-05', registeredOn: '2026-10-01' });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'keep.touch', targetId: b.id });
  });

  it('never moves the last use date back before registration (future registration date)', async () => {
    const b = await createKeepBottle(db, staffId, input({ registeredOn: '2026-12-01' }));
    await touchKeepBottle(db, staffId, b.id, '2026-10-05');
    expect((await listKeepBottles(db, 'active'))[0].lastUsedOn).toBe('2026-12-01');
  });

  it('updates the note while active, up to 500 characters', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await updateKeepNote(db, staffId, b.id, '来月誕生日');
    expect((await listKeepBottles(db, 'active'))[0].note).toBe('来月誕生日');
    await expect(updateKeepNote(db, staffId, b.id, 'あ'.repeat(501))).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses touch, note and drop on a dropped or unknown bottle', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await dropKeepBottle(db, staffId, b.id, '2026-10-05');
    await expect(touchKeepBottle(db, staffId, b.id, '2026-10-06')).rejects.toThrow('keep_not_active');
    await expect(updateKeepNote(db, staffId, b.id, 'x')).rejects.toThrow('keep_not_active');
    await expect(dropKeepBottle(db, staffId, b.id, '2026-10-06')).rejects.toThrow('keep_not_active');
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(touchKeepBottle(db, staffId, missing, '2026-10-06')).rejects.toThrow('keep_not_found');
    await expect(updateKeepNote(db, staffId, missing, 'x')).rejects.toThrow('keep_not_found');
    await expect(dropKeepBottle(db, staffId, missing, '2026-10-06')).rejects.toThrow('keep_not_found');
  });

  it('keeps the drop date consistent with the status (check constraint)', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await expect(
      db.query(`update keep_bottles set status = 'dropped' where id = $1`, [b.id]),
    ).rejects.toThrow(/keep_dropped_on_matches_status/);
  });

  it('does not let a drink with keep bottles be deleted', async () => {
    await createKeepBottle(db, staffId, input());
    await expect(db.query('delete from drinks where id = $1', [drinkId])).rejects.toMatchObject({ code: '23503' });
  });
});
```

- [ ] **Step 4: 失敗を確認する**

Run: `npx vitest run tests/db/keepBottles.test.ts`
Expected: FAIL（`@/lib/repo/keepBottles` が見つからない）

- [ ] **Step 5: リポジトリを実装する**

`src/lib/repo/keepBottles.ts`:

```ts
import type { Db } from '../db/types';
import type { KeepBottle } from '../types';
import { writeAudit } from './audit';

// date 列は文字列で返す。Date にすると実行環境のタイムゾーンで 1 日ずれることがある。
const KEEP_COLUMNS = `id, customer_name as "customerName", drink_id as "drinkId", drink_name as "drinkName",
  to_char(registered_on, 'YYYY-MM-DD') as "registeredOn", to_char(last_used_on, 'YYYY-MM-DD') as "lastUsedOn",
  status, to_char(dropped_on, 'YYYY-MM-DD') as "droppedOn", note, created_at as "createdAt"`;

/** キープ中は最終利用日が古い順（期限が近い順）、期限切れは期限切れにした日が新しい順。 */
export async function listKeepBottles(db: Db, status: 'active' | 'dropped'): Promise<KeepBottle[]> {
  const order =
    status === 'active'
      ? 'last_used_on, registered_on, customer_name, id'
      : 'dropped_on desc, customer_name, id';
  return db.query<KeepBottle>(`select ${KEEP_COLUMNS} from keep_bottles where status = $1 order by ${order}`, [status]);
}

export async function createKeepBottle(
  db: Db,
  actorId: string,
  input: { customerName: string; drinkId: string; registeredOn: string; note: string },
): Promise<KeepBottle> {
  return db.transaction(async (tx) => {
    const [drink] = await tx.query<{ name: string; isActive: boolean }>(
      'select name, is_active as "isActive" from drinks where id = $1',
      [input.drinkId],
    );
    if (!drink) throw new Error('drink_not_found');
    if (!drink.isActive) throw new Error('inactive_drink');
    const [bottle] = await tx.query<KeepBottle>(
      `insert into keep_bottles (customer_name, drink_id, drink_name, registered_on, last_used_on, note, staff_id)
       values ($1, $2, $3, $4, $4, $5, $6) returning ${KEEP_COLUMNS}`,
      [input.customerName, input.drinkId, drink.name, input.registeredOn, input.note, actorId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.create',
      targetType: 'keep_bottle',
      targetId: bottle.id,
      details: { name: `${input.customerName} / ${drink.name}`, registeredOn: input.registeredOn },
    });
    return bottle;
  });
}

/** キープ中の行を取り直してロックする。なければ keep_not_found、期限切れなら keep_not_active。 */
async function lockActive(tx: Db, id: string): Promise<{ customerName: string; drinkName: string }> {
  const [row] = await tx.query<{ customerName: string; drinkName: string; status: string }>(
    'select customer_name as "customerName", drink_name as "drinkName", status from keep_bottles where id = $1 for update',
    [id],
  );
  if (!row) throw new Error('keep_not_found');
  if (row.status !== 'active') throw new Error('keep_not_active');
  return row;
}

/** 最終利用日を today にする。登録日より前には戻さない。 */
export async function touchKeepBottle(db: Db, actorId: string, id: string, today: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await tx.query('update keep_bottles set last_used_on = greatest(last_used_on, $2::date) where id = $1', [id, today]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.touch',
      targetType: 'keep_bottle',
      targetId: id,
      details: { name: `${row.customerName} / ${row.drinkName}`, lastUsedOn: today },
    });
  });
}

export async function updateKeepNote(db: Db, actorId: string, id: string, note: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await tx.query('update keep_bottles set note = $2 where id = $1', [id, note]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.note',
      targetType: 'keep_bottle',
      targetId: id,
      details: { name: `${row.customerName} / ${row.drinkName}` },
    });
  });
}

export async function dropKeepBottle(db: Db, actorId: string, id: string, today: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await tx.query(`update keep_bottles set status = 'dropped', dropped_on = $2::date where id = $1`, [id, today]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.drop',
      targetType: 'keep_bottle',
      targetId: id,
      details: { name: `${row.customerName} / ${row.drinkName}`, droppedOn: today },
    });
  });
}
```

- [ ] **Step 6: 通ることを確認する**

Run: `npx vitest run tests/db/keepBottles.test.ts tests/db/lockdown.test.ts tests/db/migrate.test.ts`
Expected: PASS。`lockdown` は全テーブルを調べるので、`keep_bottles` の RLS と revoke もここで確かめられる。

もし `updateKeepNote` の 501 文字のテストで `code` が `23514` にならなければ、PGlite が返すエラーの形を `console.log` で確かめ、テストの期待を実際の `code` に合わせる（制約違反であること自体は変えない）。

- [ ] **Step 7: 型チェックとコミット**

Run: `npm run typecheck`
Expected: エラーなし

```bash
git add db/migrations/0009_keep_bottles.sql src/lib/types.ts src/lib/errors.ts src/lib/repo/keepBottles.ts "src/app/(app)/admin/page.tsx" tests/db/keepBottles.test.ts
git commit -m "feat: キープボトルのテーブルと DB 操作を足す" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 入力の検証と Server Actions

**Files:**
- Modify: `src/lib/validation.ts`（末尾にキープ用スキーマを足す）
- Create: `src/app/(keep)/keep/actions.ts`
- Test: `tests/unit/keepValidation.test.ts`

**Interfaces:**
- Consumes: Task 1 の `todayJst`、Task 2 の `createKeepBottle` / `touchKeepBottle` / `updateKeepNote` / `dropKeepBottle`、既存の `requireStaff`、`getDb`、`toUserMessage`、`FormState`
- Produces:
  - `KEEP_NOTE_MAX = 500`、`keepCreateSchema`（`customerName`, `drinkId`, `registeredOn`, `note`）、`keepNoteSchema`（`id`, `note`）、`keepIdSchema`（`id`）
  - Server Actions（すべて `(prev: FormState, formData: FormData) => Promise<FormState>`）: `createKeepAction`（成功したら `/keep` へ redirect）、`touchKeepAction`、`updateKeepNoteAction`、`dropKeepAction`。フォームのフィールド名は `customerName` / `drinkId` / `registeredOn` / `note` / `id`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/keepValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { keepCreateSchema, keepNoteSchema } from '@/lib/validation';

const valid = {
  customerName: ' 田中様 ',
  drinkId: '6f1c2b0e-8f6a-4b8e-9d51-3f2d8c1a7e10',
  registeredOn: '2026-10-05',
  note: '',
};

describe('keep validation', () => {
  it('accepts a valid input and trims the name', () => {
    const r = keepCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerName).toBe('田中様');
  });

  it('requires a customer name and a drink', () => {
    expect(keepCreateSchema.safeParse({ ...valid, customerName: '   ' }).error?.issues[0].message).toBe('お客様名を入力してください');
    expect(keepCreateSchema.safeParse({ ...valid, drinkId: '' }).error?.issues[0].message).toBe('お酒を選んでください');
  });

  it('limits the name to 50 and the note to 500 characters', () => {
    expect(keepCreateSchema.safeParse({ ...valid, customerName: 'あ'.repeat(51) }).success).toBe(false);
    expect(keepCreateSchema.safeParse({ ...valid, note: 'あ'.repeat(500) }).success).toBe(true);
    expect(keepCreateSchema.safeParse({ ...valid, note: 'あ'.repeat(501) }).error?.issues[0].message).toBe('メモは500文字以内にしてください');
    expect(keepNoteSchema.safeParse({ id: valid.drinkId, note: 'あ'.repeat(501) }).success).toBe(false);
  });

  it('rejects dates that are not real calendar days', () => {
    expect(keepCreateSchema.safeParse({ ...valid, registeredOn: '2026-02-30' }).success).toBe(false);
    expect(keepCreateSchema.safeParse({ ...valid, registeredOn: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/unit/keepValidation.test.ts`
Expected: FAIL（`keepCreateSchema` がない）

- [ ] **Step 3: スキーマを足す**

`src/lib/validation.ts` の末尾に追記（`isValidYmd` と `uuid` は同じファイルで読み込み済み）:

```ts
export const KEEP_NOTE_MAX = 500;
const keepNote = z.string().trim().max(KEEP_NOTE_MAX, `メモは${KEEP_NOTE_MAX}文字以内にしてください`);

export const keepCreateSchema = z.object({
  customerName: z.string().trim().min(1, 'お客様名を入力してください').max(50, 'お客様名は50文字以内にしてください'),
  drinkId: z.uuid('お酒を選んでください'),
  registeredOn: z.string().refine(isValidYmd, '登録日が正しくありません'),
  note: keepNote,
});

export const keepNoteSchema = z.object({ id: uuid, note: keepNote });
export const keepIdSchema = z.object({ id: uuid });
```

- [ ] **Step 4: Server Actions を書く**

`src/app/(keep)/keep/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { todayJst } from '@/lib/keep';
import { createKeepBottle, dropKeepBottle, touchKeepBottle, updateKeepNote } from '@/lib/repo/keepBottles';
import { keepCreateSchema, keepIdSchema, keepNoteSchema } from '@/lib/validation';

export async function createKeepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepCreateSchema.safeParse({
    customerName: formData.get('customerName'),
    drinkId: formData.get('drinkId'),
    registeredOn: formData.get('registeredOn'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createKeepBottle(getDb(), staff.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  redirect('/keep');
}

export async function touchKeepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await touchKeepBottle(getDb(), staff.id, parsed.data.id, todayJst());
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  return { message: '最終利用日を今日にしました' };
}

export async function updateKeepNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepNoteSchema.safeParse({ id: formData.get('id'), note: formData.get('note') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateKeepNote(getDb(), staff.id, parsed.data.id, parsed.data.note);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  return { message: 'メモを保存しました' };
}

export async function dropKeepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await dropKeepBottle(getDb(), staff.id, parsed.data.id, todayJst());
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  return { message: '期限切れにしました' };
}
```

- [ ] **Step 5: 通ることを確認する**

Run: `npx vitest run tests/unit/keepValidation.test.ts && npm run typecheck`
Expected: PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/validation.ts "src/app/(keep)/keep/actions.ts" tests/unit/keepValidation.test.ts
git commit -m "feat: キープの入力検証と Server Actions を足す" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 専用レイアウトと一覧画面

**Files:**
- Create: `src/app/(keep)/layout.tsx`
- Create: `src/app/(keep)/KeepNav.tsx`
- Create: `src/app/(keep)/keep/page.tsx`
- Create: `src/app/(keep)/keep/KeepList.tsx`
- Create: `src/app/(keep)/keep/KeepRow.tsx`

**Interfaces:**
- Consumes: Task 1 の `daysRemaining` / `expiryLabel` / `isExpired` / `countNearExpiry` / `filterByCustomer` / `todayJst` / `KEEP_EXPIRY_DAYS` / `KEEP_WARN_DAYS`、Task 2 の `listKeepBottles`、Task 3 の 3 つの Action、既存の `logoutAction`（`@/app/login/actions` と同じもの）、`submitWithoutReset`、`initialFormState`
- Produces: `/keep` の画面。`KeepList` の props は `{ active: KeepBottle[]; dropped: KeepBottle[]; today: string }`

この Task は画面なので、動作の確認は Task 6 の e2e で行う。ここでは型チェックと、実際に画面を開いての目視で確かめる。

- [ ] **Step 1: レイアウトとナビを書く**

`src/app/(keep)/KeepNav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/keep', label: '一覧' },
  { href: '/keep/new', label: '登録' },
];

export function KeepNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="キープ" className="fixed inset-x-0 bottom-0 border-t bg-white">
      <ul className="mx-auto flex max-w-4xl">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
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

`src/app/(keep)/layout.tsx`:

```tsx
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { logoutAction } from '../login/actions';
import { KeepNav } from './KeepNav';

export default async function KeepLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="mx-auto min-h-dvh max-w-4xl pb-20">
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-2 text-sm">
        <span className="min-w-0 truncate font-bold">遊栄キープボトル管理</span>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/" className="text-blue-700 underline">
            在庫管理へ
          </Link>
          <span className="max-w-[8rem] truncate">{staff.name}</span>
          <form action={logoutAction}>
            <button className="text-blue-600 underline">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
      <KeepNav />
    </div>
  );
}
```

- [ ] **Step 2: 一覧ページ（サーバー側）を書く**

`src/app/(keep)/keep/page.tsx`:

```tsx
import { getDb } from '@/lib/db/client';
import { todayJst } from '@/lib/keep';
import { listKeepBottles } from '@/lib/repo/keepBottles';
import { KeepList } from './KeepList';

export default async function KeepPage() {
  // 認証は (keep)/layout.tsx の requireStaff() で済んでいる。
  const db = getDb();
  const [active, dropped] = await Promise.all([listKeepBottles(db, 'active'), listKeepBottles(db, 'dropped')]);
  return <KeepList active={active} dropped={dropped} today={todayJst()} />;
}
```

- [ ] **Step 3: 一覧（クライアント）を書く**

`src/app/(keep)/keep/KeepList.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { KEEP_EXPIRY_DAYS, KEEP_WARN_DAYS, countNearExpiry, filterByCustomer } from '@/lib/keep';
import type { KeepBottle } from '@/lib/types';
import { KeepRow } from './KeepRow';

type Tab = 'active' | 'dropped';

export function KeepList({ active, dropped, today }: { active: KeepBottle[]; dropped: KeepBottle[]; today: string }) {
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const rows = filterByCustomer(tab === 'active' ? active : dropped, query);
  const nearExpiry = countNearExpiry(active, today);

  return (
    <div className="space-y-4">
      {nearExpiry > 0 && (
        <p role="status" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          期限まで{KEEP_WARN_DAYS}日以内（超過を含む）のボトルが {nearExpiry} 本あります
        </p>
      )}
      <div className="flex gap-2" role="tablist" aria-label="キープの状態">
        {(
          [
            ['active', `キープ中（${active.length}）`],
            ['dropped', `期限切れ（${dropped.length}）`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded px-3 py-2 text-sm ${tab === key ? 'bg-blue-600 font-bold text-white' : 'border bg-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="お客様名で検索"
        placeholder="お客様名で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">
          {query ? '該当するボトルがありません。' : tab === 'active' ? 'キープ中のボトルはありません。' : '期限切れのボトルはありません。'}
          {tab === 'active' && !query && (
            <>
              {' '}
              <Link href="/keep/new" className="text-blue-700 underline">
                登録する
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <KeepRow key={b.id} bottle={b} today={today} />
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">期限は最終利用日から{KEEP_EXPIRY_DAYS}日です。</p>
    </div>
  );
}
```

- [ ] **Step 4: 1 件分の行を書く**

`src/app/(keep)/keep/KeepRow.tsx`:

```tsx
'use client';

import { useActionState, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { daysRemaining, expiryLabel, isExpired } from '@/lib/keep';
import { submitWithoutReset } from '@/lib/submitWithoutReset';
import type { KeepBottle } from '@/lib/types';
import { dropKeepAction, touchKeepAction, updateKeepNoteAction } from './actions';

export function KeepRow({ bottle, today }: { bottle: KeepBottle; today: string }) {
  const isActive = bottle.status === 'active';
  const remaining = daysRemaining(bottle.lastUsedOn, today);
  const expired = isActive && isExpired(remaining);

  const [touchState, touchAction, touching] = useActionState(touchKeepAction, initialFormState);
  const [noteState, noteAction, savingNote] = useActionState(updateKeepNoteAction, initialFormState);
  const [dropState, dropAction, dropping] = useActionState(dropKeepAction, initialFormState);
  const [note, setNote] = useState(bottle.note);
  const [confirmingDrop, setConfirmingDrop] = useState(false);

  const error = touchState.error ?? noteState.error ?? dropState.error;

  return (
    <li className="space-y-2 rounded border bg-white p-3" data-testid="keep-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {bottle.customerName} <span className="font-normal text-gray-700">／ {bottle.drinkName}</span>
        </p>
        {isActive ? (
          <p className={`text-sm ${expired ? 'font-bold text-red-600' : 'text-gray-700'}`}>{expiryLabel(remaining)}</p>
        ) : (
          <p className="text-sm text-gray-600">{bottle.droppedOn} に期限切れ</p>
        )}
      </div>
      <p className="text-xs text-gray-600">
        登録 {bottle.registeredOn}　最終利用 {bottle.lastUsedOn}
      </p>

      {isActive ? (
        <>
          <form onSubmit={submitWithoutReset(noteAction)} className="flex gap-2">
            <input type="hidden" name="id" value={bottle.id} />
            <input
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              aria-label={`${bottle.customerName}のメモ`}
              placeholder="メモ"
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            />
            <button disabled={savingNote || note === bottle.note} className="text-sm text-blue-700 underline disabled:opacity-40">
              メモを保存
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-4">
            <form onSubmit={submitWithoutReset(touchAction)}>
              <input type="hidden" name="id" value={bottle.id} />
              <button disabled={touching} className="text-sm text-blue-700 underline disabled:opacity-50">
                今日使った（最終利用日を今日にする）
              </button>
            </form>
            {confirmingDrop ? (
              <form onSubmit={submitWithoutReset(dropAction)} className="flex items-center gap-2">
                <input type="hidden" name="id" value={bottle.id} />
                <button disabled={dropping} className="rounded bg-red-600 px-2 py-1 text-sm font-bold text-white disabled:opacity-50">
                  本当に期限切れにする
                </button>
                <button type="button" onClick={() => setConfirmingDrop(false)} className="text-sm text-gray-600 underline">
                  やめる
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setConfirmingDrop(true)} className="text-sm text-red-700 underline">
                期限切れにする
              </button>
            )}
          </div>
        </>
      ) : (
        bottle.note && <p className="text-sm text-gray-700">メモ：{bottle.note}</p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {(touchState.message || noteState.message) && !error && (
        <p aria-live="polite" className="text-xs text-green-700">
          {touchState.message ?? noteState.message}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 5: 型チェックと目視確認**

Run: `npm run typecheck`
Expected: エラーなし。`/keep/new` はまだないので、ナビの「登録」は 404 でよい（Task 5 で作る）。

- [ ] **Step 6: コミット**

```bash
git add "src/app/(keep)"
git commit -m "feat: キープ専用レイアウトと一覧画面を足す" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 登録画面（お酒の検索付き選択）

**Files:**
- Create: `src/app/(keep)/keep/new/page.tsx`
- Create: `src/app/(keep)/keep/new/KeepForm.tsx`
- Create: `src/app/(keep)/keep/new/DrinkPicker.tsx`

**Interfaces:**
- Consumes: Task 1 の `todayJst`、Task 3 の `createKeepAction`、既存の `listDrinks` / `listCategories`、`CATEGORY_ALL` / `categoryOptions` / `inCategory`、`matchesSearch`、`Drink` / `Category` 型
- Produces: `DrinkPicker` の props は `{ drinks: Drink[]; categories: Category[]; value: string; onChange: (drinkId: string) => void }`。選ばれた `drinkId` は `KeepForm` の隠し input（`name="drinkId"`）で送る

- [ ] **Step 1: お酒の検索付き選択を書く**

`src/app/(keep)/keep/new/DrinkPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CATEGORY_ALL, categoryOptions, inCategory } from '@/lib/categoryFilter';
import { matchesSearch } from '@/lib/search';
import type { Category, Drink } from '@/lib/types';

/** 候補の出しすぎを避ける。絞り込めば出てくる。 */
const MAX_SHOWN = 30;

export function DrinkPicker({
  drinks,
  categories,
  value,
  onChange,
}: {
  drinks: Drink[];
  categories: Category[];
  value: string;
  onChange: (drinkId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORY_ALL);

  const matched = drinks.filter((d) => matchesSearch(d.name, query));
  const options = categoryOptions(matched, categories, categoryId);
  const shown = matched.filter((d) => inCategory(d, categoryId));
  const selected = drinks.find((d) => d.id === value);

  return (
    <div className="space-y-2">
      <span className="block text-sm">お酒</span>
      <div className="flex gap-2">
        <select
          aria-label="種類"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border bg-white px-2 py-2 text-sm"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.key === CATEGORY_ALL ? '種類：すべて' : o.label}（{o.count}）
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="お酒の名前で検索"
          placeholder="お酒の名前で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded border px-3 py-2"
        />
      </div>
      {selected && (
        <p className="text-sm">
          選択中：<strong>{selected.name}</strong>
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-gray-600">該当するお酒がありません。</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto rounded border bg-white">
          {shown.slice(0, MAX_SHOWN).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                aria-pressed={d.id === value}
                onClick={() => onChange(d.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${d.id === value ? 'bg-blue-50 font-bold' : ''}`}
              >
                <span>{d.name}</span>
                <span className="text-xs text-gray-500">{d.categoryName ?? '未分類'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > MAX_SHOWN && (
        <p className="text-xs text-gray-500">ほかに {shown.length - MAX_SHOWN} 件あります。名前や種類で絞り込んでください。</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 登録フォームを書く**

`src/app/(keep)/keep/new/KeepForm.tsx`:

```tsx
'use client';

import { useActionState, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { submitWithoutReset } from '@/lib/submitWithoutReset';
import type { Category, Drink } from '@/lib/types';
import { createKeepAction } from '../actions';
import { DrinkPicker } from './DrinkPicker';

export function KeepForm({ drinks, categories, today }: { drinks: Drink[]; categories: Category[]; today: string }) {
  const [state, formAction, pending] = useActionState(createKeepAction, initialFormState);
  const [drinkId, setDrinkId] = useState('');

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4 rounded border bg-white p-4">
      <h1 className="font-bold">キープボトルを登録</h1>
      <label className="block">
        <span className="mb-1 block text-sm">お客様名</span>
        <input name="customerName" required maxLength={50} className="w-full rounded border px-3 py-2" />
      </label>
      <DrinkPicker drinks={drinks} categories={categories} value={drinkId} onChange={setDrinkId} />
      <input type="hidden" name="drinkId" value={drinkId} />
      <label className="block">
        <span className="mb-1 block text-sm">登録日</span>
        <input name="registeredOn" type="date" required defaultValue={today} className="rounded border px-3 py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">メモ（500文字まで）</span>
        <textarea name="note" maxLength={500} rows={3} className="w-full rounded border px-3 py-2" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        登録する
      </button>
    </form>
  );
}
```

- [ ] **Step 3: 登録ページを書く**

`src/app/(keep)/keep/new/page.tsx`:

```tsx
import { getDb } from '@/lib/db/client';
import { todayJst } from '@/lib/keep';
import { listCategories } from '@/lib/repo/categories';
import { listDrinks } from '@/lib/repo/drinks';
import { KeepForm } from './KeepForm';

export default async function KeepNewPage() {
  const db = getDb();
  const [drinks, categories] = await Promise.all([listDrinks(db), listCategories(db)]);
  if (drinks.length === 0) {
    return <p>お酒が登録されていません。在庫管理の「ボトル」から登録してください。</p>;
  }
  return <KeepForm drinks={drinks} categories={categories} today={todayJst()} />;
}
```

- [ ] **Step 4: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add "src/app/(keep)/keep/new"
git commit -m "feat: キープ登録画面にお酒の検索付き選択を足す" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 入り口のリンクと e2e

**Files:**
- Modify: `src/app/(app)/layout.tsx`（ヘッダーに「キープ」リンクを足す）
- Test: `e2e/keep.spec.ts`

**Interfaces:**
- Consumes: Task 4・5 の画面。aria-label・ボタン名: `お客様名`（label）、`お酒の名前で検索`、`種類`、`登録する`、`お客様名で検索`、`今日使った（最終利用日を今日にする）`、`期限切れにする`、`本当に期限切れにする`、タブ `キープ中（n）` / `期限切れ（n）`
- Produces: 在庫側のヘッダーから `/keep` へ、キープ側のヘッダーから `/` へ行き来できる入り口

- [ ] **Step 1: 在庫側のヘッダーにリンクを足す**

`src/app/(app)/layout.tsx` の、アカウントへのリンク（`<Link href="/account" ...>`）の直前に足す:

```tsx
          <Link href="/keep" className="text-blue-700 underline">
            キープ管理へ
          </Link>
```

- [ ] **Step 2: e2e を書く**

`e2e/keep.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string, pin: string) {
  await page.goto('/login');
  await page.getByLabel('名前').selectOption({ label: name });
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('link', { name: '在庫', exact: true })).toBeVisible();
}

test('register a keep bottle from the drink list, use it, and drop it', async ({ page }) => {
  await login(page, '管理者', '1234');

  // キープ用のお酒を在庫側で登録しておく
  await page.getByRole('link', { name: 'ボトル', exact: true }).click();
  await page.getByLabel('ボトル名').fill('キープ用ウイスキー');
  await page.getByLabel('1ケースの本数').fill('12');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('キープ用ウイスキー を登録しました')).toBeVisible();

  // 在庫側のヘッダーからキープ側の入り口へ
  await page.getByRole('link', { name: 'キープ管理へ' }).click();
  await expect(page).toHaveURL(/\/keep$/);
  await expect(page.getByText('キープ中のボトルはありません。')).toBeVisible();

  // 登録: ひらがなで検索してお酒を選ぶ
  await page.getByRole('link', { name: '登録', exact: true }).click();
  await page.getByLabel('お客様名', { exact: true }).fill('田中様');
  await page.getByLabel('お酒の名前で検索').fill('きーぷよう');
  await page.getByRole('button', { name: /キープ用ウイスキー/ }).click();
  await expect(page.getByText('選択中：キープ用ウイスキー')).toBeVisible();
  await page.getByRole('button', { name: '登録する' }).click();

  // 一覧に出る。登録したばかりなので あと180日
  await expect(page).toHaveURL(/\/keep$/);
  await expect(page.getByText('田中様')).toBeVisible();
  await expect(page.getByText('あと180日')).toBeVisible();

  // 検索（カタカナでもひらがなでも）
  await page.getByLabel('お客様名で検索').fill('たなか');
  await expect(page.getByTestId('keep-row')).toHaveCount(1);
  await page.getByLabel('お客様名で検索').fill('さとう');
  await expect(page.getByTestId('keep-row')).toHaveCount(0);
  await page.getByLabel('お客様名で検索').fill('');

  // 最終利用日の更新
  await page.getByRole('button', { name: '今日使った（最終利用日を今日にする）' }).click();
  await expect(page.getByText('最終利用日を今日にしました')).toBeVisible();

  // 期限切れにする（確認つき）
  await page.getByRole('button', { name: '期限切れにする', exact: true }).click();
  await page.getByRole('button', { name: '本当に期限切れにする' }).click();
  await expect(page.getByText('キープ中のボトルはありません。')).toBeVisible();
  await page.getByRole('tab', { name: /期限切れ（1）/ }).click();
  await expect(page.getByText('田中様')).toBeVisible();
  await expect(page.getByText(/に期限切れ/)).toBeVisible();

  // キープ側のヘッダーから在庫側へ戻れる
  await page.getByRole('link', { name: '在庫管理へ' }).click();
  await expect(page.getByRole('link', { name: '在庫', exact: true })).toBeVisible();
});

test('keep pages need a login', async ({ page }) => {
  await page.goto('/keep');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/keep/new');
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 3: e2e を実行する**

Run: `npx playwright test e2e/keep.spec.ts`
Expected: 2 件 PASS。落ちたら、ロケーターの文言（`getByLabel('お客様名', { exact: true })` が「お客様名で検索」と曖昧にならないか、など）をその場の画面に合わせて直す。`/keep` が `登録` リンクを 2 つ見つけるようなら、`KeepNav` 内に絞って `page.getByRole('navigation', { name: 'キープ' }).getByRole('link', { name: '登録' })` にする。

- [ ] **Step 4: 全体を確認する**

Run: `npm run typecheck && npm test && npx playwright test`
Expected: すべて PASS（既存の `e2e/inventory.spec.ts` も含めて）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(app)/layout.tsx" e2e/keep.spec.ts
git commit -m "feat: 在庫とキープの入り口を行き来できるようにし、e2e を足す" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review（書いたあとの確認）

- **設計書との対応**: 画面（一覧・登録・タブ・検索・バナー・各操作）は Task 4・5、データは Task 2、コードの分割は Task 1〜3、エラー処理は Task 2・3 のテスト、テストは Task 1〜3・6。180 日と 30 日バナーは Task 1 の定数にだけ置いた。
- **設計書にない追加**: 在庫側ヘッダーの「キープ管理へ」リンク（Task 6 Step 1）と、期限切れにする操作の確認ボタン。前者は入り口へ行く手段がないと使えないため、後者は誤タップで期限切れにしないために足した。不要なら削る。
- **名前の一貫性**: `daysRemaining` / `expiryLabel` / `isExpired` / `countNearExpiry` / `filterByCustomer` / `todayJst`、`createKeepBottle` / `touchKeepBottle` / `updateKeepNote` / `dropKeepBottle` / `listKeepBottles`、Action 名 `createKeepAction` / `touchKeepAction` / `updateKeepNoteAction` / `dropKeepAction` は各 Task で同じ。
- **既知の注意**: `drinks` を物理削除するコードは現状見当たらない（`drink.delete` は監査ラベルだけ）。もし将来削除を足すなら、キープがあるお酒は `on delete restrict` で止まる（Task 2 のテストで確認）。
