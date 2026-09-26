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
- テーブルを追加するときは 0004_lockdown.sql と同様に RLS を有効にすること
