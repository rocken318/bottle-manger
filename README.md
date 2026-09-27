# 遊栄ボトル在庫管理システム

事務所・各店舗のボトル在庫を、入荷・販売・移動・棚卸で管理する Web アプリ。

## 開発

```bash
npm install
cp .env.example .env.local   # DATABASE_URL と SESSION_SECRET を設定
npm run db:migrate
npm run db:create-admin -- 名前 1234 事務所   # 最初の1人はマスター、以降は管理者
npm run dev
```

## 権限

| | スタッフ | 管理者 | マスター |
|---|---|---|---|
| 在庫の入力・閲覧 | ○ | ○ | ○ |
| 管理画面（拠点・原価・スタッフ） | × | ○ | ○ |
| スタッフのPIN変更・編集 | × | ○ | ○ |
| 管理者・マスターの任命、管理者のPIN変更 | × | × | ○ |
| マスターのPIN変更 | 本人のみ（アカウント画面） | | |

開発者はスクリプトで誰のどの項目でも変更できる（マスターのPINも含む。操作ログに「システム」として残る）。
管理者・マスターが0人になる変更だけは止める。

```bash
npm run db:staff -- list                      # 全員の権限・所属・状態
npm run db:staff -- role   名前 master        # master | admin | staff
npm run db:staff -- pin    名前 新しいPIN     # 後で本人にアカウント画面で変えてもらう
npm run db:staff -- rename 名前 新しい名前
npm run db:staff -- home   名前 拠点名        # 「なし」で所属なし
npm run db:staff -- active 名前 off           # on | off
npm run db:staff -- unlock 名前
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
