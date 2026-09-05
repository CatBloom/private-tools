# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

Node.js 24 / pnpm。

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

Hono SSR をシェルに、ツールはクライアント側でマウントするマルチツール構成（現在3ツール: Credit CSV Viewer / Prompt Builder / MyTodo）。Vercel の Hono プリセットが `src/index.ts` を Function のエントリとして使う。ツール横断の仕組み（登録・共有 UI・デザイントークン・ストレージ骨格・ビルド設定）を先に説明し、各ツール固有の差分はその後の節にまとめる。

### ツール登録とルーティング

- `src/tools/registry.ts` — ツール定義の一覧（`id`／`name`／`path`／`description`／`entry`／`clientScript`／`css`／`nav`／`inlineStyle`）。react 非依存・JSX なしの純データで、`TopPage.ts`・`app.ts`・`vite.config.ts`（node から実行）・`ToolLayout`/`ToolMenu`（クライアント共通メニュー）から import する。
- `src/server/app.ts` — アプリ本体。`createApp(options)` ファクトリと default インスタンスを輸出。`options` でテスト用に `creditCsvStorage`／`promptWordStorage`／`promptHistoryStorage`／`myTodoStorage`（Storage 注入）や `assetOverrides` を差し込める。favicon（`/favicon.ico`）は TOP・ツールシェルの head に `<link rel="icon">` を出し、本番のみ Hono ルートで `src/public/favicon.ico` をバイナリ配信する（開発は `vite.config.ts` の `servePublicFavicon`）。
- `src/index.ts` — Vercel エントリ。`src/server/app.ts` の default export を再輸出するだけ。
- `src/ui/TopPage.ts` — TOP ハブ（`/`）の**純 SSR** コンポーネント。`registry.ts` の一覧からカードを生成する（`description` は機能名だけの短い文。スマホ幅で1行に収まる長さを目安にし、「〜を管理する」のような動作説明にしない）。**SSR で使うコンポーネントは JSX ではなく `createElement` を使い拡張子 `.ts` にする**（Vercel のサーバービルドは import 指定子 `'../ui/TopPage.js'` を `.ts` には解決できるが `.tsx` には解決できず、実行時に `ERR_MODULE_NOT_FOUND` になるため）。JSX を使うクライアント専用コンポーネントは `.tsx` でよい（Vite がバンドルする）。
- `src/client-credit-csv.tsx`／`src/client-prompt-builder.tsx`／`src/client-my-todo.tsx` — 各ツールのクライアントエントリ。中身は `mountTool(<XxxApp />)` の定型のみ（下記 `mountTool` 参照）。**ツール別にエントリを分離**し、各ツールページは自分のバンドルだけを読む（他ツールのコードを混ぜない）。

登録順が重要（先に登録したものが優先）。CSP のパス分岐・SSR シェル（4以降）は `registry.ts` の一覧から組み立てる。API のマウントはストレージ注入で形が違うため registry には持たせず、明示的に1行ずつ書く:
1. CSP middleware（`app.use('*', ...)`、`registry.ts` の `inlineStyle: true` なツールの path 配下だけ緩和。下記「セキュリティと API 規約」参照）
2. 各ツールの API を **catch-all より必ず前**にマウント: `app.route('/tools/credit-csv/api', createCreditCsvRoutes(...))`、`app.route('/tools/prompt-builder/api', createPromptBuilderRoutes(...))`、`app.route('/tools/my-todo/api', createMyTodoRoutes(...))`
3. （production のみ）`/styles.css`、`/assets/:filename`
4. `/` — TOP ハブ SSR
5. `registry.ts` の一覧をループして各ツールの SSR シェルを登録（`/tools/<tool>` と `/tools/<tool>/*`。空 `#root`＋そのツールのクライアントスクリプト＋ツール CSS の `<link>`）。深いパスの直リンクも同じシェルを返し、クライアント側の `react-router`（`BrowserRouter basename="/tools/<tool>"`）が処理する。シェル HTML は `toolShellHtml(title, clientScript, builtCssHref)` で共通生成する
6. `app.notFound(...)` — `/api/*` 系は JSON、それ以外は HTML の 404

### ツールを追加する手順

1. `src/tools/registry.ts` に1件追加する（`id`／`name`／`path`／`description`／`entry`／`clientScript`／`css`／`nav`／`inlineStyle`）。
2. `src/client-<id>.tsx` を1ファイル追加する（既存3つと同じ `mountTool(<XxxApp />)` の定型）。
3. `src/tools/<id>/` にツール本体を置く。`index.tsx` の default export で `<ToolLayout toolId="<id>" appClassName="<id>-app">` にラップし、状態 Provider（`AlertProvider`/`ConfirmProvider` 等）はその内側に置く。
4. サーバー API が要るなら `src/server/routes/<id>.ts` を作り、`src/server/app.ts` に `app.route('/tools/<id>/api', create<Id>Routes(...))` を1行追加する（registry には持たせない）。
5. KV 永続化が要るなら `src/server/storage/<id>/` に Local／KV 実装を作り、`src/server/storage/shared/kv-client.ts`・`select-storage.ts` の共通骨格に乗せる。Vercel 環境変数に `CLOUDFLARE_KV_<TOOL>_NAMESPACE_ID` を追加する（Account ID／API Token は既存ツールと共有）。

`vite.config.ts` の `rollupOptions.input` は registry から自動生成されるため、上記以外に触る箇所はない。

### 共有 UI・レイアウト

- `src/hooks/useTheme.ts`／`usePersistedState.ts` — 3ツール共通のテーマ状態・localStorage 永続化フック。テーマの localStorage キーは `src/lib/storage.ts` の `THEME_STORAGE_KEY`（TOP の `src/ui/theme.ts` も同じキーを使い、TOP とツール間でテーマを共有する）。
- `src/components/ThemeToggle.tsx` — 3ツール共通のテーマ切替ボタン。
- `src/components/layout/ToolLayout.tsx` — 全ツール共通のヘッダー（☰ボタン＋ツール名）＋左ドロワーメニュー＋本文レイアウト。props は `toolId`（registry から対応するツール情報を引く）・`appClassName`（テーマ切替スコープ・ツール別 CSS の適用先 wrapper の className。例: `credit-csv-app`）・`children`。
- `src/components/layout/ToolMenu.tsx` — ドロワーの中身。上から (1) 見出し「ツール名」＋そのツールの機能ナビ（registry の `nav`）、(2) 見出し「他のツール」＋他ツールへのリンク一覧（registry から自ツールを除いた一覧）、(3) 最下部に「← ツール一覧」（`.pt-button`）とテーマ切替を同じ幅で横並び（`.tool-layout-menu-actions`）。credit-csv が持っていたデスクトップ固定サイドバーは廃止し、3ツールとも同じドロワー構造にする。閉じている間は `<aside>` に `inert` を付け、画面外のリンクへ Tab フォーカスが渡らないようにする（`aria-hidden` は Testing Library の `getByRole` が要素を除外してテストが壊れるため使わない）。
- `src/components/layout/ToolTabs.tsx` — 本文上のページ切替タブ。`toolId` から registry の `nav` を `.pt-tab` の `NavLink` で描画し、`ToolLayout` の `tabs?: boolean`（既定 false）で有効化する。ドロワー内の機能ナビとは併存の仕様で、my-todo・prompt-builder は有効、credit-csv は無効。見た目は styles.css の `.tool-layout-tabs`／`.pt-tab` に集約する。
- 各ツールの `index.tsx`（または `<Tool>Routes.tsx`）は `<ToolLayout>` の内側（`.<tool>-app[data-theme]` の配下）で `AlertProvider`/`ConfirmProvider`（必要なら `TodoProvider`/`AppDataProvider` 等の状態 Provider）をラップする。`ToolLayout` の外側に置くと、トースト/ダイアログが `.<tool>-app` と兄弟要素になり `[data-theme]` スコープの CSS 変数を継承できないため。
- `src/components/RowMenu.tsx` — 行操作を「⋯」に集約する共通オーバーフローメニュー（my-todo の行、prompt-builder のワード行）。`items: RowMenuItem[]` を受け取り、外側クリック・Escape で閉じる。スタイルは styles.css の `.row-menu-*`。
- `src/components/feedback/` — 3ツール共通の UI フィードバック（`AlertProvider`/`useAlert` トースト、`ConfirmProvider`/`useConfirm` 確認ダイアログ、`Spinner`）。
- `src/lib/mountTool.tsx` — 各クライアントエントリ共通の `createRoot(document.getElementById('root')!).render(app)` 定型（**hydrate ではなく createRoot**。ツールシェルは空 `#root` を返すため）。
- `src/lib/copyText.ts` — iOS/WebKit 向けのクリップボードコピー（同期 `document.execCommand('copy')` を先に試し、失敗時のみ非同期 Clipboard API にフォールバック）。単一ツールでしか使わなくても「特定の処理」は分離してテストを付ける方針の一例。
- `src/public/` — 静的資産。`styles.css`（TOP・全ツールのシェルが常時 link）は Git 管理、`assets/`（ビルド生成物）は gitignore。**共有 UI の CSS（`.fbk-*`／`.tool-layout-*`／`.theme-toggle`／`.pt-*` 共通部品）は styles.css に置く**：コンポーネント側で `import './x.css'` すると Vite が共有チャンクの CSS（例 `assets/ConfirmProvider.css`）に分割し、シェルはツール別バンドルの CSS（`client-credit-csv.css`／`client-prompt-builder.css`／`client-my-todo.css`）しか link しないため**本番で無スタイル化**する（トースト/ダイアログ・ドロワーが素の状態で描画される）。常時 link される styles.css に置けば dev/prod とも確実に読み込まれる。

### デザイントークン（`src/public/styles.css`）

- 色・余白・角丸・影・フォントサイズを `--pt-*` の1系統で `:root` に定義する（ツール別トークンの独自定義はない）。ダークは `@media (prefers-color-scheme: dark)` 内の `:root:not([data-theme="light"])` と、`:root` に紐付けないベア属性セレクタ `[data-theme="dark"]` の両方で同じ値を上書きする。TOP は `<html data-theme>`（`src/ui/theme.ts` が付与）、各ツールは `ToolLayout` が付ける `.<tool>-app[data-theme]` に切り替え用の `data-theme` が乗るため、ベア属性セレクタにすることでどちらの要素にもそのまま属性セレクタとしてヒットし、子孫に継承させている。`color-scheme` と地色（`color`/`background`）は文書ルート限定の設定なので `:root` にのみ置き、`.<tool>-app` には波及させない。
- ブレークポイント（デスクトップ切替）は 48rem（≒768px）固定。カスタムプロパティは `@media` の条件式に使えないため、値は各所に直書きする。
- ボタン・入力欄・カード・バッジ・タブ・テーブルの基本部品は `.pt-button`／`.pt-button-danger`／`.pt-button-accent`／`.pt-input`／`.pt-card`／`.pt-badge`／`.pt-tab`／`.pt-table` として styles.css に集約する。各ツール CSS はツール固有のレイアウトだけを持つ。

### ビルド設定（`vite.config.ts`）とバンドル方針

- `rollupOptions.input` は `registry.ts` の一覧（各ツールの `entry.name`／`entry.src`）から生成し、`theme`（`src/ui/theme.ts`）だけ固定で追加する。
- `manualChunks` はパッケージ名でベンダーチャンクを分離する: `react`／`react-dom`／`scheduler` → `vendor-react`、`react-router`／`react-router-dom` → `vendor-router`、`@dnd-kit/*` → `vendor-dnd`、recharts とその依存一式（`recharts-scale`／`victory-vendor`／`react-smooth`／`d3-*` 等）→ `vendor-recharts`。pnpm の仮想ストア構造（`node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...`）に対応するため、最後の `node_modules/` 以降の先頭セグメントでパッケージ名を判定する。
- 各ツールの重いページは `React.lazy` + `Suspense` で遅延読込し、初期チャンクから外す（credit-csv: recharts を使う `DetailPage`／`MerchantPage`／`YearlyPage`、prompt-builder: @dnd-kit を使う `OutputPage`）。ルートを跨いで状態を持ち上げる場合は「常時マウント＋CSS 切替」ではなく Context（`AppDataProvider`／`TodoProvider` 等）を使う。**常時マウント＋CSS 切替のパターンは使わない**（lazy 化した意味が無くなるため）。
- `outDir:'src/public'`／`emptyOutDir:false`／`publicDir:false`（この2フラグは `src/public/styles.css` を消さないために必要）。出力名はハッシュなし安定名（`entryFileNames:'assets/[name].js'`、`assetFileNames:'assets/[name][extname]'`）でシェルの参照名を固定する。

### Credit CSV Viewer（`src/tools/credit-csv/`）

クレジットカード明細 CSV（Shift_JIS の `YYYYMM.csv`）をアップロードして利用月ベースで集計・閲覧するツール。移植元は別リポジトリ `CatBloom/credit-csv-viewer`。

- `lib/` — 純粋ロジック（`csv.ts` パース／日付補完、`format.ts` 店名正規化・類似度グルーピング・日本円表記、`selectors.ts` 絞り込み・集計、`types.ts`）。移植元からほぼそのまま移植。**CSV の読込は `buildAppData(files)`**（アップロード済みバイト列から構築。移植元の `loadAppData`/`import.meta.glob` は廃棄）。
- UI（`.tsx`、新規再設計）: `index.tsx` が default export `CreditCsvApp`（自己完結、`credit-csv.css` を import）。`CreditCsvRoutes.tsx` が `<ToolLayout toolId="credit-csv" appClassName="credit-csv-app" tabs>` でラップし、本文上に 明細／年間合計／ファイル管理 のタブを出す。画面は 明細／年間合計／ファイル管理＋店名別（`/merchant/:merchant`）。チャートは **recharts（クライアント専用・lazy）**。未知の内部パスは `/` にリダイレクト。
- テーマ切替は共通 `useTheme`/`ThemeToggle`（`.credit-csv-app[data-theme]` にスコープ）。
- CSV アップロード・アップロード済み一覧・一覧からの削除。

### Prompt Builder（`src/tools/prompt-builder/`）

画像生成プロンプトの「ワード」をタグで管理し、選択順に並べてカンマ区切りで組み立て・コピーするツール。**UI に「NovelAI」表記は出さない**。ワードは**分類を持たない共有プール**（タグ12種で絞り込み管理）。保存履歴には**ターゲット属性**（`HistoryEntry.target`＝どの入力欄に貼るか。3値: `base` / `character` / `negative`）を付ける。ページは `/words`（ワード管理）と `/output`（出力組み立て）の2つで、不明パス（旧分類パス含む）は `/words` へリダイレクト。

- `shared/` — **react 非依存の純粋モジュール**（`targets.ts` は履歴ターゲットの ID／ラベル／`isPromptTargetId`、`tags.ts` はタグ12種（アルファベット順＋others 最下）と `normalizeTag`、`types.ts` の `PromptWord = {id,text,description,tag}`／`OutputItem = {id,wordId,text,weight}`／`HistoryEntry = {id,name,createdAt,target,items}`）。**サーバー route からも import する**ため JSX を含めない。
- `lib/notation.ts` — 純粋ロジック（`applyNotation`：weight 正=`{}`／負=`[]` の重ね掛け段数・±5 クランプ、`buildOutput`：カンマ結合、`reorder`）。`lib/outputStorage.ts` — **組み立て中の**出力欄状態を localStorage に永続化。キーは単一の `prompt-builder:output`。WordsPage の「出力に追加」は `readOutputItems`/`writeOutputItems` で localStorage を直接読み書きして追記する（両ページは同時マウントされないため整合する）。
- **保存履歴**：組み立てた出力を名前付きスナップショット（`HistoryEntry`、保存時に `target` をセレクトで選択）として **KV に保存**するライブラリ。出力ページ・現在の出力の下に配置し、保存・復元（現在の出力を置換）・削除・名前編集ができ、一覧は target のバッジ表示＋絞り込みに対応。KV キーは単一の `history`（サーバーは `src/server/storage/prompt-builder/` の履歴ストレージ）。**組み立て中の出力は localStorage・保存した履歴は KV** と役割が分かれる。
- UI（`.tsx`）: `index.tsx` が default export `PromptBuilderApp`（`prompt-builder.css` を import）。`<ToolLayout toolId="prompt-builder" appClassName="prompt-builder-app">` でラップし、直下にナビタブ「ワード」「出力」（registry の `nav` から `ToolMenu` が生成）。デスクトップ（48rem 以上）はタブ・本文を `max-width: 1040px` で中央寄せ。`WordsPage` — 一覧・登録フォーム内包（タグ未選択の間は追加ボタン disabled）・タグ絞り込み（初期値「ALL」＝タグ見出し付きグループ表示、特定タグでフラット表示）。ワード行（ワード＋説明の2行、スマホでも同じ高さ）はクリックで出力に追加し、編集・削除は共通 `RowMenu`（⋯）に集約する。`OutputPage`（lazy） — **@dnd-kit で並べ替え**〈`PointerSensor`＋`TouchSensor` でモバイル対応〉、個別削除、強調記法付与、カンマ結合＋コピー、保存履歴（保存時に target をセレクトで選択・未選択は保存ボタン disabled、一覧はワードと同じく「ALL＝target 見出し付きグループ表示／特定 target＝フラット表示」の絞り込み、編集で名前と target を変更可・復元/更新/削除はトースト通知）。ワードの `id` はクライアントで採番。出力アイテムの `text` は**選択時点のスナップショット**（ワード編集後も復元が壊れない）。
- **ワードの保存**：手動「保存」ボタン（即時 PUT）＋**デバウンス自動保存**（変更が止まって10秒後にまとめて1回 PUT。`AUTO_SAVE_DELAY_MS`）の併用。1KVキー（`words`）に配列まるごと PUT なので、Cloudflare KV 無料枠（**書き込み1,000回/日・同一キー1秒1回**）を消費しすぎないよう「操作ごと」ではなく「アイドル10秒でまとめて」保存する。保存失敗時は**自動リトライしない**（次のワード編集が `saveStatus` を `idle` に戻して再アーム。放置すると10秒ごとに書き込みクォータを浪費するため）。ページ遷移（アンマウント）で未保存分が消えないようアンマウント時に best-effort で flush する。**履歴の保存は明示操作のまま**（自動保存の対象外）。
- テーマ切替は共通 `useTheme`/`ThemeToggle`（`.prompt-builder-app[data-theme]` にスコープ）。
- **@dnd-kit**: `@dnd-kit/core` と `@dnd-kit/sortable` を使う。`@dnd-kit/utilities` は依存に入れず、`useSortable` の `transform` は自前で `translate3d(...)` の CSS 文字列にする（単一リストの並べ替えでは scale 不要）。CSP の `style-src` に `'unsafe-inline'` が必要なのはこの inline transform のため。

### MyTodo（`src/tools/my-todo/`）

今日やること（Today）といつかやること（Someday）を分けて管理する ToDo リスト。ページは `/today`・`/someday`（既定 `/today`、不明パスはリダイレクト）で、切替は `ToolLayout` のナビ（registry の `nav`）から行う。

- `shared/types.ts` — react 非依存の型（`TodoItem`／`TodoState = {today,someday,lastRolloverDate}`／`TodoSectionId`）と `TODAY_LIMIT`（`= 5`。Today に置ける**未完了**アイテムの上限。完了済みはカウントしない）。**サーバー route からも import する**ため JSX を含めない。
- `state/TodoContext.tsx` — Today/Someday の状態を1箇所に持ち上げ、ページ（ルート）を切り替えても保持する。保存は変更のたび即時 PUT（デバウンス無し）が基本だが、Cloudflare KV の「同一キー1秒1回」制約を守るため書き込みは最小間隔（`MIN_WRITE_INTERVAL_MS = 1000`）でゲートする：前回の書き込み開始から1秒未満なら残り時間だけ遅延させ、発火時に最新状態を取り直して送る（1秒以上経っていれば即時）。送信自体も in-flight ガードで直列化し（同時実行は常に高々1本）、通信中に来た変更は完了後に最新値との差分があればもう一度だけ送る。失敗時（ネットワーク/認証等）は**自動リトライしない**（次の操作が再アーム）。
- `lib/rollover.ts` — 日付が変わったときに1日1回だけ適用する繰り越しの純粋関数。同一日（`lastRolloverDate` が今日と一致）なら state をそのまま返す（no-op）。`lastRolloverDate` が `null`（初回起動）は日付を記録するだけでアイテムは動かさない。それ以外（日付が変わった）は全セクションの完了済みアイテムを削除し、Today に残っていた未完了アイテムを Someday の末尾へ移動する。
- `lib/move.ts` — セクション間移動の純粋関数（`moveItem`）と Today の上限判定（`canPlaceInToday`／`countUnfinished`）。移動できない場合は state をそのまま返す（参照不変で no-op を表す）。
- `lib/reorder.ts` — 同一セクション内の並べ替えの純粋関数。
- 行の操作（セクション間移動・編集・削除）は共通 `src/components/RowMenu.tsx`（⋯）に集約する（モバイルでのタスクテキスト表示幅を確保するため、行に個別ボタンを並べない）。
- UI: `index.tsx` が default export `MyTodoApp`（`my-todo.css` を import、`<ToolLayout toolId="my-todo" appClassName="my-todo-app">` でラップ）。`SectionPage` が追加フォーム・@dnd-kit（`PointerSensor`＋`TouchSensor`＋`KeyboardSensor`）での並べ替え・完了チェック・インライン編集・削除・セクション間移動を提供する。テーマ切替は共通 `useTheme`/`ThemeToggle`（`.my-todo-app[data-theme]` にスコープ）。

### ストレージ共通骨格（`src/server/storage/shared/`）

- `kv-client.ts` — Cloudflare Workers KV REST の薄いラッパー `CloudflareKvClient`（`getJson`/`putJson`/`request`）。3ツールの KV ストレージ実装はこの上に積む。credit-csv の value+metadata 形式の一覧取得だけはこの形に合わないため `request()` を直接使う。
- `select-storage.ts` — `selectByEnv(options)`：Account ID＋ツール別 Namespace env＋API Token が揃えば KV 実装、揃わなければ Local 実装を返す判定を共通化する。各ツールの `select*Storage()` はこの関数へ `namespaceEnv`／`kv`／`local` を渡すだけ。
- 環境変数は Account ID（`CLOUDFLARE_ACCOUNT_ID`）と API トークン（`CLOUDFLARE_KV_API_TOKEN`）を3ツールで共有し、Namespace のみツールごとに `CLOUDFLARE_KV_<TOOL>_NAMESPACE_ID` 形式で別立てする（credit-csv: `CLOUDFLARE_KV_CREDIT_NAMESPACE_ID`、prompt-builder: `CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`、my-todo: `CLOUDFLARE_KV_TODO_NAMESPACE_ID`）。**サーバー専用・`process.env` からのみ・クライアントに絶対混入させない**。

### Credit CSV ストレージ（`src/server/storage/credit-csv/`）

`CreditCsvStorage` インターフェース（`list/get/put/delete`、`StoredFileMeta = {name,size,uploadedAt}`）と2実装 `LocalCreditCsvStorage`（gitignore した `.data/` にファイル保存）／`CloudflareKvCreditCsvStorage`。`selectCreditCsvStorage()` は `CLOUDFLARE_KV_CREDIT_NAMESPACE_ID` を使って `selectByEnv` に委譲する。ファイル名は必ず `^\d{6}\.csv$`（`assertValidFileName`）で検証してからパス/キーに使う（パストラバーサル対策）。Vercel Serverless のボディ上限（約4.5MB）のため、アップロードは **4MiB 上限**。本番運用には Cloudflare KV の別途設定が必要（未設定のうちは Local フォールバックのみ）。

### Prompt ストレージ（`src/server/storage/prompt-builder/`）

Prompt Builder 専用。ワード用と履歴用の2系統で、どちらも**同じ KV Namespace／同じ env**（`CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`）を使い、キー名で分ける。
- ワード：`PromptWordStorage`（`getWords/putWords`、`PromptWord[]` を丸ごと読み書き）。KV キーは単一の `words`、Local は `.data/prompt-builder/words.json`。
- 履歴：`PromptHistoryStorage`（`getHistory/putHistory`、`HistoryEntry[]` を丸ごと読み書き）。KV キーは単一の `history`、Local は `.data/prompt-builder/history.json`。
- 実装は各 `LocalPromptWordStorage`／`CloudflareKvPromptWordStorage`／`LocalPromptHistoryStorage`／`CloudflareKvPromptHistoryStorage`。`selectPromptWordStorage()`／`selectPromptHistoryStorage()` はどちらも `CLOUDFLARE_KV_PROMPT_NAMESPACE_ID` で `selectByEnv` に委譲する。履歴の `target` は route 層で `isPromptTargetId` により検証する。

### Todo ストレージ（`src/server/storage/my-todo/`）

MyTodo 専用。`MyTodoStorage`（`getTodos/putTodos`、`TodoState` を丸ごと読み書き）と2実装 `LocalMyTodoStorage`（`.data/my-todo/todos.json`）／`CloudflareKvMyTodoStorage`。KV キーは単一の `todos`。`selectMyTodoStorage()` は `CLOUDFLARE_KV_TODO_NAMESPACE_ID` で `selectByEnv` に委譲する。

### CSV アップロード API（`src/server/routes/credit-csv.ts`）

`createCreditCsvRoutes(storage?)` が Hono サブアプリを返す（`/tools/credit-csv/api` にマウント）。`GET/POST /files`（POST は multipart、field `file`）、`GET/DELETE /files/:name`。バリデーション: ファイル名 `^\d{6}\.csv$`（不正 400）、4MiB 超 413、非 multipart 415、未存在 404。CSV は生バイトのまま保存し、デコード（Shift_JIS）・パースはクライアントで行う。

### ワード API（`src/server/routes/prompt-builder.ts`）

`createPromptBuilderRoutes(storage?, historyStorage?)` が Hono サブアプリを返す（`/tools/prompt-builder/api` にマウント）。
- ワード：`GET /words`（共有プールのワード一覧）、`PUT /words`（JSON `{ words }` で丸ごと置換）。
- 履歴：`GET /history`（保存履歴一覧）、`PUT /history`（JSON `{ entries }` で丸ごと置換。各エントリの `target` は `isPromptTargetId` で検証）。
- バリデーション: 非 JSON 415、payload 不正（`target` 不正含む）400、ボディ 4MiB 超 413、ワード数 2000 超／履歴エントリ数 200 超 413。`{ ok, data }` 規約は共通。

### ToDo API（`src/server/routes/my-todo.ts`）

`createMyTodoRoutes(storage?)` が Hono サブアプリを返す（`/tools/my-todo/api` にマウント）。`GET /todos`（現在の状態。未保存なら空状態）、`PUT /todos`（JSON `{ state }` で丸ごと置換）。バリデーション: 非 JSON 415、payload 不正 400、アイテムの `text` 長 1000 文字超は無効、`today`+`someday` の合計アイテム数 500 件超 413、ボディ 4MiB 超 413。`TODAY_LIMIT`（Today 未完了5件まで）は UI 側のルールでサーバー側では強制しない。

### 静的資産の配信（dev と production で経路が違う）

このリポジトリで最も間違えやすい部分。

| | 開発 | 本番 |
| --- | --- | --- |
| client script | `/src/client-credit-csv.tsx`（Vite） | `/assets/client-credit-csv.js` |
| ツール CSS | Vite が JS 経由で注入 | `/assets/client-credit-csv.css`（ビルドで抽出）を `<link>` |
| `/styles.css`（TOP用） | `vite.config.ts` の `servePublicStyles` | Hono ルート |
| `/favicon.ico` | `vite.config.ts` の `servePublicFavicon` | Hono の `GET /favicon.ico`（バイナリ・本番のみ） |
| `/assets/*` | Vite dev server | Hono の `GET /assets/:filename` |

`client-credit-csv.tsx`/`client-credit-csv.js` は credit-csv の例。prompt-builder は `client-prompt-builder.tsx`/`client-prompt-builder.js`、my-todo は `client-my-todo.tsx`/`client-my-todo.js` と、ツールごとにファイル名が変わるだけで経路は共通。

- 切り替えは `process.env.NODE_ENV` のみ。Hono の静的アセットルートは **production のときだけ登録される**。
- **`GET /assets/:filename`**: `src/public/assets/` からのみ読み、`^[A-Za-z0-9._-]+$` で検証（`/`・エンコード済み `../` を拒否＝パストラバーサル対策）、拡張子で Content-Type 判定、モジュールスコープでキャッシュ。存在しなければ 404。
- 本番のファイル実体は `src/public/` から読み、`vercel.json` の `includeFiles` で Function に同梱する。Output Directory は設定しない。

### セキュリティと API 規約

- CSP は単一 middleware でパス分岐: `registry.ts` の `inlineStyle: true` なツール（現状 credit-csv・prompt-builder・my-todo の全ツール）の path 配下だけ `style-src 'self' 'unsafe-inline'`（credit-csv は recharts のインライン style＋Vite の CSS 注入、prompt-builder／my-todo は @dnd-kit の inline transform のため。共通の `inlineStyleSecureHeaders` を使う）、それ以外（TOP 等）は `style-src 'self'`。**`script-src` は全ルート厳格**（dev のみ Vite preamble 用に `'unsafe-inline'`）。TOP に React バンドルを出さないこと（テーマ用 `theme.js` のみ）・ルート別 CSP はテストが検証している。
- API レスポンスは `{ ok:true, data }` / `{ ok:false, error:{ message } }`。エラーメッセージに内部情報を含めない。
- サーバー専用の認証情報（KV トークン等）・`node:fs`・storage コードをクライアントバンドルに入れない（各 `client-*.tsx → <Tool>App → api.ts` の依存に storage を混ぜない。ビルド後 `src/public/assets/client-credit-csv.js`・`client-prompt-builder.js`・`client-my-todo.js` を grep して混入ゼロを確認できる）。

### テスト

vitest + jsdom。サーバーテストは `app.request('http://localhost/...')` で HTTP を通さず検証。`NODE_ENV` を書き換えるテストは `finally` で復元。recharts・@dnd-kit は jsdom で完全描画/ドラッグ再現できないため UI テストではモックし、並べ替えロジックは `lib/reorder.ts`／`lib/notation.ts` の `reorder` など純粋関数を単体で検証する。**実際のカード明細（移植元 `data/*.csv`）はフィクスチャに使わない。合成データのみ**。

## この構成で守ること

- UI・SSR・静的資産・CSP・ルーティングを変更したら、`pnpm run check` だけで完了としない。dev サーバーで `/`（TOP・script なし）・3ツールのシェル（`/tools/credit-csv` 等）・API・`/styles.css` を実 HTTP 取得し、ブラウザでコンソール／CSP／描画エラーがないことまで確認する。確認できなければ「問題なし」ではなく「未検証」と報告する。
- `requirements.html` がプロダクト要件の正。`AGENTS.md` に責務境界とデリバリー規約（PR は日本語、`## 概要` と `## 説明` の見出し）がある。
- ローカルの進捗メモは `task/` 配下（gitignore 済み・コミット禁止）。エージェントのミスを指摘されたら `task/MISTAKES.md` に追記する。
