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
- `src/server/app.ts` — アプリ本体。`createApp(options)` ファクトリと default インスタンスを輸出。`options` でテスト用に `creditCsvStorage`／`promptWordStorage`／`promptHistoryStorage`（Storage 注入）や `assetOverrides` を差し込める。favicon（`/favicon.ico`）は TOP・ツールシェルの head に `<link rel="icon">` を出し、本番のみ Hono ルートで `src/public/favicon.ico` をバイナリ配信する（開発は `vite.config.ts` の `servePublicFavicon`）。
- `src/ui/TopPage.ts` — TOP ハブ（`/`）の**純 SSR** コンポーネント。ツール一覧をカードで並べる。将来ツールが増えたらここに追加する。**SSR で使うコンポーネントは JSX ではなく `createElement` を使い拡張子 `.ts` にする**（Vercel のサーバービルドは import 指定子 `'../ui/TopPage.js'` を `.ts` には解決できるが `.tsx` には解決できず、実行時に `ERR_MODULE_NOT_FOUND` になるため）。JSX を使うクライアント専用コンポーネントは `.tsx` でよい（Vite がバンドルする）。
- `src/client.tsx` — Credit CSV Viewer のクライアントエントリ。`createRoot(...).render(<CreditCsvApp/>)`（**hydrate ではなく createRoot**。ツールシェルは空 `#root` を返すため）。**ツールページでのみ読み込まれ、TOP には React バンドルを出さない**（TOP はテーマ切替の小さな `theme.js` のみ＝React バンドルなし）。
- `src/client-prompt.tsx` — Prompt Builder のクライアントエントリ。**ツール別にエントリを分離**し、各ツールページは自分のバンドルだけを読む（credit-csv ページに prompt のコードを混ぜない）。
- `src/tools/credit-csv/` — Credit CSV Viewer ツール（`/tools/credit-csv`）。
- `src/tools/prompt-builder/` — Prompt Builder ツール（`/tools/prompt-builder`）。
- `src/server/routes/` — ツール別 Hono API。
- `src/server/storage/` — Credit CSV 永続化のストレージ抽象。
- `src/server/prompt-storage/` — Prompt Builder 用の別ストレージ抽象（credit-csv とは分離。KV Namespace も別）。
- `src/components/feedback/` — 両ツール共通の UI フィードバック（`AlertProvider`/`useAlert` トースト、`ConfirmProvider`/`useConfirm` 確認ダイアログ、`Spinner`）。各ツールは `Layout` の内側（`.<tool>-app[data-theme]` 配下）で Provider をラップする（トースト/ダイアログが `[data-theme]` を継承できるように）。**スタイルは `src/public/styles.css` に置く**（下記の理由）。
- `src/components/layout/` — **サイドバー無しツールのデフォルトヘッダー** `ToolHeader`（props は `title` と右側要素用の `children` のみ。タイトル左・右側に「← ツール一覧」固定リンク＋children〈テーマ切替等をツール側から渡す〉。テーマフックに依存しない）。スタイル（`.tool-header-*`）も styles.css に置く。
- `src/public/` — 静的資産。`styles.css`（TOP・両ツールのシェルが常時 link）は Git 管理、`assets/`（ビルド生成物）は gitignore。**共有フィードバックの CSS（`.fbk-*`）は styles.css に置く**：コンポーネント側で `import './x.css'` すると Vite が共有チャンクの CSS（`assets/ConfirmProvider.css` 等）に分割し、シェルは `client.css`/`client-prompt.css` しか link しないため**本番で無スタイル化**する（トースト/ダイアログが素の状態でページ最下部に出る）。常時 link される styles.css に置けば dev/prod とも確実に読み込まれる。

### ルーティングと画面構成（`src/server/app.ts`）

登録順が重要（先に登録したものが優先）。各ツールは同じパターンで登録する:
1. CSP middleware（`app.use('*', ...)`、パスで分岐。下記参照）
2. 各ツールの API を **catch-all より必ず前**にマウント: `app.route('/tools/credit-csv/api', createCreditCsvRoutes(...))`、`app.route('/tools/prompt-builder/api', createPromptWordRoutes(...))`
3. （production のみ）`/styles.css`、`/assets/:filename`
4. `/` — TOP ハブ SSR
5. 各ツールの SSR シェル（`/tools/<tool>` と `/tools/<tool>/*`。空 `#root`＋そのツールのクライアントスクリプト＋ツール CSS の `<link>`）。深いパスの直リンクも同じシェルを返し、クライアント側の `react-router`（`BrowserRouter basename="/tools/<tool>"`）が処理する。シェル HTML は `toolShellHtml(title, clientScript, builtCssHref)` で共通生成する
6. `app.notFound(...)` — `/api/*` 系は JSON、それ以外は HTML の 404

### Credit CSV Viewer（`src/tools/credit-csv/`）

クレジットカード明細 CSV（Shift_JIS の `YYYYMM.csv`）をアップロードして利用月ベースで集計・閲覧するツール。移植元は別リポジトリ `CatBloom/credit-csv-viewer`。

- `lib/` — 純粋ロジック（`csv.ts` パース／日付補完、`format.ts` 店名正規化・類似度グルーピング・日本円表記、`selectors.ts` 絞り込み・集計、`types.ts`）。移植元からほぼそのまま移植。**CSV の読込は `buildAppData(files)`**（アップロード済みバイト列から構築。移植元の `loadAppData`/`import.meta.glob` は廃棄）。
- UI（`.tsx`、新規再設計）: `index.tsx` が default export `CreditCsvApp`（自己完結、`credit-csv.css` を import）。画面は 明細／年間合計／ファイル管理＋店名別（`/merchant/:merchant`）。チャートは **recharts（クライアント専用）**。未知の内部パスは `/` にリダイレクト。
- テーマ切替は `localStorage` 永続化（`.ccsv-app[data-theme]` にスコープ、アイランドなので `documentElement` は触らない）。
- **新機能**: CSV アップロード・アップロード済み一覧・一覧からの削除。

### Prompt Builder（`src/tools/prompt-builder/`）

画像生成プロンプトの「ワード」をタグで管理し、選択順に並べてカンマ区切りで組み立て・コピーするツール。**UI に「NovelAI」表記は出さない**。ワードは**分類を持たない共有プール**（タグ10種で絞り込み管理）。保存履歴には**ターゲット属性**（`HistoryEntry.target`＝どの入力欄に貼るか。3値: `base` / `character` / `negative`）を付ける。ページは `/words`（ワード管理）と `/output`（出力組み立て）の2つで、不明パス（旧分類パス含む）は `/words` へリダイレクト。

- `shared/` — **react 非依存の純粋モジュール**（`targets.ts` は履歴ターゲットの ID／ラベル／`isPromptTargetId`、`tags.ts` はタグ10種（アルファベット順＋others 最下）と `normalizeTag`、`types.ts` の `PromptWord = {id,text,description,tag}`／`OutputItem = {id,wordId,text,weight}`／`HistoryEntry = {id,name,createdAt,target,items}`）。**サーバー route からも import する**ため JSX を含めない。
- `lib/notation.ts` — 純粋ロジック（`applyNotation`：weight 正=`{}`／負=`[]` の重ね掛け段数・±5 クランプ、`buildOutput`：カンマ結合、`reorder`）。`lib/outputStorage.ts` — **組み立て中の**出力欄状態を localStorage に永続化。キーは単一の `prompt-builder:output`。WordsPage の「出力に追加」は `readOutputItems`/`writeOutputItems` で localStorage を直接読み書きして追記する（両ページは同時マウントされないため整合する）。
- **保存履歴**：組み立てた出力を名前付きスナップショット（`HistoryEntry`、保存時に `target` をセレクトで選択）として **KV に保存**するライブラリ。出力ページ・現在の出力の下に配置し、保存・復元（現在の出力を置換）・削除・名前編集ができ、一覧は target のバッジ表示＋絞り込みに対応。KV キーは単一の `history`（サーバーは `src/server/prompt-storage/` の履歴ストレージ）。**組み立て中の出力は localStorage・保存した履歴は KV** と役割が分かれる。
- UI（`.tsx`）: `index.tsx` が default export `PromptBuilderApp`（`prompt-builder.css` を import）。`Layout` は共有 `ToolHeader`（サイドバー無し）＋直下にナビタブ「ワード」「出力」。デスクトップ（48rem 以上）はヘッダー内側・タブ・本文を `max-width: 1040px` で中央寄せ。`WordsPage` — 一覧・登録フォーム内包・インライン編集・削除・タグ絞り込み（初期値「ALL」＝タグ見出し付きグループ表示、特定タグでフラット表示）・「出力に追加」（タグ未選択の間は追加ボタン disabled）。`OutputPage` — **@dnd-kit で並べ替え**〈`PointerSensor`＋`TouchSensor` でモバイル対応〉、個別削除、強調記法付与、カンマ結合＋コピー、保存履歴（保存時に target をセレクトで選択・未選択は保存ボタン disabled、一覧はワードと同じく「ALL＝target 見出し付きグループ表示／特定 target＝フラット表示」の絞り込み、編集で名前と target を変更可・復元/更新/削除はトースト通知）。ワードの `id` はクライアントで採番。出力アイテムの `text` は**選択時点のスナップショット**（ワード編集後も復元が壊れない）。
- **ワードの保存**：手動「保存」ボタン（即時 PUT）＋**デバウンス自動保存**（変更が止まって10秒後にまとめて1回 PUT。`AUTO_SAVE_DELAY_MS`）の併用。1KVキー（`words`）に配列まるごと PUT なので、Cloudflare KV 無料枠（**書き込み1,000回/日・同一キー1秒1回**）を消費しすぎないよう「操作ごと」ではなく「アイドル10秒でまとめて」保存する。保存失敗時は**自動リトライしない**（次のワード編集が `saveStatus` を `idle` に戻して再アーム。放置すると10秒ごとに書き込みクォータを浪費するため）。ページ遷移（アンマウント）で未保存分が消えないようアンマウント時に best-effort で flush する。**履歴の保存は明示操作のまま**（自動保存の対象外）。
- テーマ切替は `.pbuilder-app[data-theme]` にスコープ（credit-csv と同じ `THEME_STORAGE_KEY` を共有、`documentElement` は触らない）。フック（`useTheme`/`usePersistedState`）は credit-csv 配下を import せず prompt-builder 内に自前で持つ（ツール間結合を避ける）。
- **@dnd-kit**: `@dnd-kit/core` と `@dnd-kit/sortable` を使う。`@dnd-kit/utilities` は依存に入れず、`useSortable` の `transform` は自前で `translate3d(...)` の CSS 文字列にする（単一リストの並べ替えでは scale 不要）。CSP の `style-src` に `'unsafe-inline'` が必要なのはこの inline transform のため。

### ストレージ（`src/server/storage/`）

`Storage` インターフェース（`list/get/put/delete`、`StoredFileMeta = {name,size,uploadedAt}`）と2実装:
- `LocalStorage` — gitignore した `.data/` にファイル保存（開発フォールバック）。
- `CloudflareKvStorage` — Cloudflare Workers KV REST。環境変数 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_KV_NAMESPACE_ID` / `CLOUDFLARE_KV_API_TOKEN`（**サーバー専用・`process.env` からのみ・クライアントに絶対混入させない**）。
- `selectStorage()` は3つの env が揃えば KV、なければ Local を返す。ファイル名は必ず `^\d{6}\.csv$`（`assertValidFileName`）で検証してからパス/キーに使う（パストラバーサル対策）。
- **注意**: 本番の実運用には Cloudflare KV の別途設定が必要（未設定のうちは Local フォールバックのみ）。Vercel Serverless のボディ上限（約4.5MB）のため、アップロードは **4MiB 上限**。

### Prompt ストレージ（`src/server/prompt-storage/`）

Prompt Builder 専用。ワード用と履歴用の2系統。どちらも**同じ KV Namespace／同じ env** を使い、キー名で分ける。
- ワード：`PromptWordStorage`（`getWords/putWords`、`PromptWord[]` を丸ごと読み書き）。KV キーは単一の `words`、Local は `.data/prompt-builder/words.json`。
- 履歴：`PromptHistoryStorage`（`getHistory/putHistory`、`HistoryEntry[]` を丸ごと読み書き）。KV キーは単一の `history`、Local は `.data/prompt-builder/history.json`。
- 実装は各 `LocalPromptStorage`／`CloudflareKvPromptStorage`／`LocalHistoryStorage`／`CloudflareKvHistoryStorage`。環境変数は Account ID / API Token（`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_KV_API_TOKEN`）を credit-csv と**共有**し、**Namespace のみ別立て**の `CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`（**サーバー専用・`process.env` からのみ・クライアントに絶対混入させない**）。
- `selectPromptStorage()`／`selectPromptHistoryStorage()` は Account ID＋`CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`＋API Token が揃えば KV、なければ Local を返す。キー・パスは固定文字列のみで動的要素を含まない（履歴の `target` は route 層で `isPromptTargetId` により検証する）。

### CSV アップロード API（`src/server/routes/credit-csv.ts`）

`createCreditCsvRoutes(storage?)` が Hono サブアプリを返す（`/tools/credit-csv/api` にマウント）。`GET/POST /files`（POST は multipart、field `file`）、`GET/DELETE /files/:name`。バリデーション: ファイル名 `^\d{6}\.csv$`（不正 400）、4MiB 超 413、非 multipart 415、未存在 404。CSV は生バイトのまま保存し、デコード（Shift_JIS）・パースはクライアントで行う。

### ワード API（`src/server/routes/prompt-builder.ts`）

`createPromptWordRoutes(storage?, historyStorage?)` が Hono サブアプリを返す（`/tools/prompt-builder/api` にマウント）。
- ワード：`GET /words`（共有プールのワード一覧）、`PUT /words`（JSON `{ words }` で丸ごと置換）。
- 履歴：`GET /history`（保存履歴一覧）、`PUT /history`（JSON `{ entries }` で丸ごと置換。各エントリの `target` は `isPromptTargetId` で検証）。
- バリデーション: 非 JSON 415、payload 不正（`target` 不正含む）400、ボディ 4MiB 超 413、ワード数 2000 超／履歴エントリ数 200 超 413。`{ ok, data }` 規約は共通。

### 静的資産の配信（dev と production で経路が違う）

このリポジトリで最も間違えやすい部分。

| | 開発 | 本番 |
| --- | --- | --- |
| client script | `/src/client.tsx`（Vite） | `/assets/client.js` |
| ツール CSS | Vite が JS 経由で注入 | `/assets/client.css`（ビルドで抽出）を `<link>` |
| `/styles.css`（TOP用） | `vite.config.ts` の `servePublicStyles` | Hono ルート |
| `/favicon.ico` | `vite.config.ts` の `servePublicFavicon` | Hono の `GET /favicon.ico`（バイナリ・本番のみ） |
| `/assets/*` | Vite dev server | Hono の `GET /assets/:filename` |

- 切り替えは `process.env.NODE_ENV` のみ。Hono の静的アセットルートは **production のときだけ登録される**。
- **`GET /assets/:filename`**: `src/public/assets/` からのみ読み、`^[A-Za-z0-9._-]+$` で検証（`/`・エンコード済み `../` を拒否＝パストラバーサル対策）、拡張子で Content-Type 判定、モジュールスコープでキャッシュ。存在しなければ 404。
- 本番のファイル実体は `src/public/` から読み、`vercel.json` の `includeFiles` で Function に同梱する。Output Directory は設定しない。
- `vite.config.ts`: `outDir:'src/public'`／`emptyOutDir:false`／`publicDir:false`（この2フラグは `src/public/styles.css` を消さないために必要）。出力名はハッシュなし安定名（`entryFileNames:'assets/[name].js'`、`assetFileNames:'assets/[name][extname]'`）でシェルの参照名を固定する。**ツールを増やすたびに `rollupOptions.input` にエントリを1つ追加する**（現状 `client`＝credit-csv／`client-prompt`＝prompt-builder／`theme`）。ツール別 CSS は各エントリの `index.tsx` が import し、本番では `client.css`／`client-prompt.css` として個別抽出される。

### セキュリティと API 規約

- CSP は単一 middleware でパス分岐: **`/tools/credit-csv` と `/tools/prompt-builder` の配下のみ `style-src 'self' 'unsafe-inline'`**（credit-csv は recharts のインライン style＋Vite の CSS 注入、prompt-builder は @dnd-kit の inline transform のため。共通の `inlineStyleSecureHeaders` を使う）、他ルートは `style-src 'self'`。**`script-src` は全ルート厳格**（dev のみ Vite preamble 用に `'unsafe-inline'`）。TOP に React バンドルを出さないこと（テーマ用 `theme.js` のみ）・ルート別 CSP はテストが検証している。
- API レスポンスは `{ ok:true, data }` / `{ ok:false, error:{ message } }`。エラーメッセージに内部情報を含めない。
- サーバー専用の認証情報（KV トークン等）・`node:fs`・storage コードをクライアントバンドルに入れない（`client.tsx → CreditCsvApp → api.ts` / `client-prompt.tsx → PromptBuilderApp → api.ts` の依存に storage を混ぜない。ビルド後 `src/public/assets/client.js`・`client-prompt.js` を grep して混入ゼロを確認できる）。

### テスト

vitest + jsdom。サーバーテストは `app.request('http://localhost/...')` で HTTP を通さず検証。`NODE_ENV` を書き換えるテストは `finally` で復元。recharts・@dnd-kit は jsdom で完全描画/ドラッグ再現できないため UI テストではモックし、並べ替えロジックは `lib/notation.ts` の `reorder` など純粋関数を単体で検証する。**実際のカード明細（移植元 `data/*.csv`）はフィクスチャに使わない。合成データのみ**。

## この構成で守ること

- UI・SSR・静的資産・CSP・ルーティングを変更したら、`pnpm run check` だけで完了としない。dev サーバーで `/`（TOP・script なし）・`/tools/credit-csv`（シェル）・API・`/styles.css` を実 HTTP 取得し、ブラウザでコンソール／CSP／描画エラーがないことまで確認する。確認できなければ「問題なし」ではなく「未検証」と報告する。
- `requirements.html` がプロダクト要件の正。`AGENTS.md` に責務境界とデリバリー規約（PR は日本語、`## 概要` と `## 説明` の見出し）がある。
- ローカルの進捗メモは `task/` 配下（gitignore 済み・コミット禁止）。エージェントのミスを指摘されたら `task/MISTAKES.md` に追記する。
