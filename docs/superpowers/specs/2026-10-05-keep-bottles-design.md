# キープボトル管理 設計書

## 目的
在庫管理アプリと同じアプリ内の別の入り口 `/keep` に、キープボトル管理を作る。
参考は `C-girl/bottlekeep` のキープ機能。ボトル入力では、在庫管理の `drinks`（お酒マスタ）から検索して選べるようにする。

## 決定事項
- 構成: 同じアプリ内の別ルート `/keep`（専用レイアウト・専用ナビ。在庫の `BottomNav` は使わない）。
- ログイン: 既存のスタッフ PIN ログイン（`requireStaff()`）を共通で使う。新しい認証は足さない。
- 機能範囲: bottlekeep のキープ機能と同等。給与・勤怠・キャスト用ポータル・残量管理・在庫連動は対象外。
- 期限: 最終利用日から **180 日**。定数 `KEEP_EXPIRY_DAYS = 180` として 1 か所に置く。

## 画面
- `/keep`: 一覧。
  - タブ「キープ中」「期限切れ」。
  - お客様名の部分一致検索（`normalizeForSearch` を使う）。
  - キープ中は最終利用日が古い順。「期限まで」列に「あと◯日」または「◯日超過」を出し、0 日以下は赤。
  - 上部バナー: 期限まで 30 日以内（超過を含む）のボトル数を表示。※bottlekeep の「30 日」の解釈からの仮定。
  - 各行の操作: 最終利用日を今日に更新、メモ編集（キープ中のみ）、「期限切れにする」。
- `/keep/new`: 登録。
  - お客様名、お酒（検索付き単一選択。種類プルダウンで絞り込み）、登録日（初期値は今日）、メモ（500 字まで）。
  - 最終利用日は登録日と同じ値で作る。

## データ（マイグレーション `0009_keep_bottles.sql`）
`keep_bottles`:
- `id`, `customer_name`（必須）
- `drink_id`（`drinks` への外部キー、`on delete restrict`）、`drink_name`（登録時点の名前のコピー。履歴を守るため）
- `registered_on`, `last_used_on`（`date`）、`status`（`active` / `dropped`）、`dropped_on`
- `note`（500 字以内）、`staff_id`（登録者）、`created_at`
- check: `last_used_on >= registered_on`、`dropped_on` は `status='dropped'` のときだけ入る。
- index: `(status, last_used_on)`。
- RLS は既存のロックダウン方式（anon・authenticated を revoke）に合わせる。

## コード
- `src/lib/keep.ts`: 残り日数・並び順・バナー判定の純粋関数。日付は Asia/Tokyo の「今日」で計算する。
- `src/lib/repo/keepBottles.ts`: 一覧・登録・最終利用日更新・メモ更新・期限切れにする。
- `src/app/(keep)/keep/...`: 専用レイアウト、一覧、登録、Server Actions。
- お酒選びの UI は `EntryForm` と同じ `src/lib/search.ts`・`categoryFilter.ts` を再利用する。

## エラー処理
- 入力は zod で検証する（お客様名必須、お酒必須、メモ 500 字）。
- 存在しない・無効な `drink_id` は登録を拒否する。
- 期限切れのボトルはメモ編集・最終利用日更新を拒否する。

## テスト
- vitest: `keep.ts`（残り日数、境界の 180 日、超過、バナー）、リポジトリ（PGlite で登録・更新・期限切れ・制約）。
- Playwright e2e: 登録 → 一覧 → 期限切れにする。

## 実装前の注意
`AGENTS.md` のとおり、この Next.js は従来と異なる。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読む。
