# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

Node.js 22 / pnpm。

```sh
pnpm install
pnpm run dev        # Vite + @hono/vite-dev-server (http://localhost:5173)
pnpm run check      # lint → typecheck → test → build（引き渡し前に必ず通す）
pnpm run build      # クライアントバンドルを src/public/assets/ に出力
```

単体での実行: `pnpm run lint` / `pnpm run typecheck` / `pnpm test` / `pnpm run build`

テストの絞り込み:

```sh
pnpm vitest run src/server/app.test.ts        # ファイル単位
pnpm vitest run src/tools/credit-csv          # ディレクトリ単位
pnpm vitest run -t 'top hub'                   # テスト名で絞る
pnpm vitest                                    # watch モード
```

CI（`.github/workflows/ci.yml`）は PR と `main` への push で lint / typecheck / test / build を実行する。

## アーキテクチャ

Hono SSR をシェルに、ツールはクライアント側でマウントするマルチツール構成。Vercel の Hono プリセットが `src/index.ts` を Function のエントリとして使う。

- `src/index.ts` — Vercel エントリ。`src/server/app.ts` の default export を再輸出するだけ。
- `src/server/app.ts` — アプリ本体。`createApp(options)` ファクトリと default インスタンスを輸出。`options` でテスト用に `creditCsvStorage`（Storage 注入）や `assetOverrides` を差し込める。
- `src/ui/TopPage.ts` — TOP ハブ（`/`）の**純 SSR** コンポーネント。ツール一覧をカードで並べる。将来ツールが増えたらここに追加する。**SSR で使うコンポーネントは JSX ではなく `createElement` を使い拡張子 `.ts` にする**（Vercel のサーバービルドは import 指定子 `'../ui/TopPage.js'` を `.ts` には解決できるが `.tsx` には解決できず、実行時に `ERR_MODULE_NOT_FOUND` になるため）。JSX を使うクライアント専用コンポーネントは `.tsx` でよい（Vite がバンドルする）。
- `src/client.tsx` — クライアントエントリ。`createRoot(...).render(<CreditCsvApp/>)`（**hydrate ではなく createRoot**。ツールシェルは空 `#root` を返すため）。**ツールページでのみ読み込まれ、TOP には `<script>` を出さない**（TOP は JS ゼロ）。
- `src/tools/credit-csv/` — Credit CSV Viewer ツール（`/tools/credit-csv`）。
- `src/server/routes/` — ツール別 Hono API。
- `src/server/storage/` — CSV 永続化のストレージ抽象。
- `src/public/` — 静的資産。`styles.css`（TOP 用）は Git 管理、`assets/`（ビルド生成物）は gitignore。

### ルーティングと画面構成（`src/server/app.ts`）

登録順が重要（先に登録したものが優先）:
1. CSP middleware（`app.use('*', ...)`、パスで分岐。下記参照）
2. `app.route('/tools/credit-csv/api', createCreditCsvRoutes(...))` — **ツール catch-all より必ず前**
3. （production のみ）`/styles.css`、`/assets/:filename`
4. `/` — TOP ハブ SSR
5. `/tools/credit-csv` と `/tools/credit-csv/*` — ツールの SSR シェル（空 `#root`＋クライアントスクリプト＋ツール CSS の `<link>`）。深いパスの直リンクも同じシェルを返し、クライアント側の `react-router`（`BrowserRouter basename="/tools/credit-csv"`）が処理する
6. `app.notFound(...)` — `/api/*` 系は JSON、それ以外は HTML の 404

### Credit CSV Viewer（`src/tools/credit-csv/`）

クレジットカード明細 CSV（Shift_JIS の `YYYYMM.csv`）をアップロードして利用月ベースで集計・閲覧するツール。移植元は別リポジトリ `CatBloom/credit-csv-viewer`。

- `lib/` — 純粋ロジック（`csv.ts` パース／日付補完、`format.ts` 店名正規化・類似度グルーピング・日本円表記、`selectors.ts` 絞り込み・集計、`types.ts`）。移植元からほぼそのまま移植。**CSV の読込は `buildAppData(files)`**（アップロード済みバイト列から構築。移植元の `loadAppData`/`import.meta.glob` は廃棄）。
- UI（`.tsx`、新規再設計）: `index.tsx` が default export `CreditCsvApp`（自己完結、`credit-csv.css` を import）。画面は 明細／年間合計／ファイル管理＋店名別（`/merchant/:merchant`）。チャートは **recharts（クライアント専用）**。未知の内部パスは `/` にリダイレクト。
- テーマ切替は `localStorage` 永続化（`.ccsv-app[data-theme]` にスコープ、アイランドなので `documentElement` は触らない）。
- **新機能**: CSV アップロード・アップロード済み一覧・一覧からの削除。

### ストレージ（`src/server/storage/`）

`Storage` インターフェース（`list/get/put/delete`、`StoredFileMeta = {name,size,uploadedAt}`）と2実装:
- `LocalStorage` — gitignore した `.data/` にファイル保存（開発フォールバック）。
- `CloudflareKvStorage` — Cloudflare Workers KV REST。環境変数 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_KV_NAMESPACE_ID` / `CLOUDFLARE_KV_API_TOKEN`（**サーバー専用・`process.env` からのみ・クライアントに絶対混入させない**）。
- `selectStorage()` は3つの env が揃えば KV、なければ Local を返す。ファイル名は必ず `^\d{6}\.csv$`（`assertValidFileName`）で検証してからパス/キーに使う（パストラバーサル対策）。
- **注意**: 本番の実運用には Cloudflare KV の別途設定が必要（未設定のうちは Local フォールバックのみ）。Vercel Serverless のボディ上限（約4.5MB）のため、アップロードは **4MiB 上限**。

### CSV アップロード API（`src/server/routes/credit-csv.ts`）

`createCreditCsvRoutes(storage?)` が Hono サブアプリを返す（`/tools/credit-csv/api` にマウント）。`GET/POST /files`（POST は multipart、field `file`）、`GET/DELETE /files/:name`。バリデーション: ファイル名 `^\d{6}\.csv$`（不正 400）、4MiB 超 413、非 multipart 415、未存在 404。CSV は生バイトのまま保存し、デコード（Shift_JIS）・パースはクライアントで行う。

### 静的資産の配信（dev と production で経路が違う）

このリポジトリで最も間違えやすい部分。

| | 開発 | 本番 |
| --- | --- | --- |
| client script | `/src/client.tsx`（Vite） | `/assets/client.js` |
| ツール CSS | Vite が JS 経由で注入 | `/assets/client.css`（ビルドで抽出）を `<link>` |
| `/styles.css`（TOP用） | `vite.config.ts` の `servePublicStyles` | Hono ルート |
| `/assets/*` | Vite dev server | Hono の `GET /assets/:filename` |

- 切り替えは `process.env.NODE_ENV` のみ。Hono の静的アセットルートは **production のときだけ登録される**。
- **`GET /assets/:filename`**: `src/public/assets/` からのみ読み、`^[A-Za-z0-9._-]+$` で検証（`/`・エンコード済み `../` を拒否＝パストラバーサル対策）、拡張子で Content-Type 判定、モジュールスコープでキャッシュ。存在しなければ 404。
- 本番のファイル実体は `src/public/` から読み、`vercel.json` の `includeFiles` で Function に同梱する。Output Directory は設定しない。
- `vite.config.ts`: `outDir:'src/public'`／`emptyOutDir:false`／`publicDir:false`（この2フラグは `src/public/styles.css` を消さないために必要）。出力名はハッシュなし安定名（`entryFileNames:'assets/client.js'`、`assetFileNames:'assets/[name][extname]'`）でシェルの参照名を固定する。

### セキュリティと API 規約

- CSP は単一 middleware でパス分岐: **`/tools/credit-csv` 配下のみ `style-src 'self' 'unsafe-inline'`**（recharts のインライン style＋Vite の CSS 注入のため）、他ルートは `style-src 'self'`。**`script-src` は全ルート厳格**（dev のみ Vite preamble 用に `'unsafe-inline'`）。TOP に `<script>` を出さないこと・ルート別 CSP はテストが検証している。
- API レスポンスは `{ ok:true, data }` / `{ ok:false, error:{ message } }`。エラーメッセージに内部情報を含めない。
- サーバー専用の認証情報（KV トークン等）・`node:fs`・storage コードをクライアントバンドルに入れない（`client.tsx → CreditCsvApp → api.ts` の依存に storage を混ぜない。ビルド後 `src/public/assets/client.js` を grep して混入ゼロを確認できる）。

### テスト

vitest + jsdom。サーバーテストは `app.request('http://localhost/...')` で HTTP を通さず検証。`NODE_ENV` を書き換えるテストは `finally` で復元。recharts は jsdom で完全描画されないため UI テストではモックする。**実際のカード明細（移植元 `data/*.csv`）はフィクスチャに使わない。合成データのみ**。

## この構成で守ること

- UI・SSR・静的資産・CSP・ルーティングを変更したら、`pnpm run check` だけで完了としない。dev サーバーで `/`（TOP・script なし）・`/tools/credit-csv`（シェル）・API・`/styles.css` を実 HTTP 取得し、ブラウザでコンソール／CSP／描画エラーがないことまで確認する。確認できなければ「問題なし」ではなく「未検証」と報告する。
- `requirements.html` がプロダクト要件の正。`AGENTS.md` に責務境界とデリバリー規約（PR は日本語、`## 概要` と `## 説明` の見出し）がある。
- ローカルの進捗メモは `task/` 配下（gitignore 済み・コミット禁止）。エージェントのミスを指摘されたら `task/MISTAKES.md` に追記する。
