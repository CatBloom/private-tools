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

Hono SSR をシェルに、ツールはクライアント側でマウントするマルチツール構成（現在4ツール: Credit CSV Viewer / Prompt Builder / My Todo / Bill Manager）。Vercel の Hono プリセットが `src/index.ts` を Function のエントリとして使う。ツール横断の仕組み（登録・共有 UI・デザイントークン・ストレージ骨格・ビルド設定）を先に説明し、各ツール固有の差分はその後の節にまとめる。

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
6. 複数ツールで使う純粋ロジックは `src/lib/<domain>/`（例: `src/lib/credit-csv/`）に置き、他ツールのディレクトリから直接 import しない。`src/tools/tool-boundary.test.ts` がツール間の相対 import を検出して失敗させる。

`vite.config.ts` の `rollupOptions.input` は registry から自動生成されるため、上記以外に触る箇所はない。

### 共有 UI・レイアウト

- `src/hooks/useTheme.ts`／`usePersistedState.ts` — 3ツール共通のテーマ状態・localStorage 永続化フック。テーマの localStorage キーは `src/lib/storage.ts` の `THEME_STORAGE_KEY`（TOP の `src/ui/theme.ts` も同じキーを使い、TOP とツール間でテーマを共有する）。
- `src/components/ThemeToggle.tsx` — 3ツール共通のテーマ切替ボタン。
- `src/components/layout/ToolLayout.tsx` — 全ツール共通のヘッダー（☰ボタン＋ツール名）＋左ドロワーメニュー＋本文レイアウト。props は `toolId`（registry から対応するツール情報を引く）・`appClassName`（テーマ切替スコープ・ツール別 CSS の適用先 wrapper の className。例: `credit-csv-app`）・`children`。
- `src/components/layout/ToolMenu.tsx` — ドロワーの中身。上から (1) 見出し「ツール名」＋そのツールの機能ナビ（registry の `nav`）、(2) 見出し「他のツール」＋他ツールへのリンク一覧（registry から自ツールを除いた一覧）、(3) 最下部に「← ツール一覧」（`.pt-button`）とテーマ切替を同じ幅で横並び（`.tool-layout-menu-actions`）。credit-csv が持っていたデスクトップ固定サイドバーは廃止し、3ツールとも同じドロワー構造にする。閉じている間は `<aside>` に `inert` を付け、画面外のリンクへ Tab フォーカスが渡らないようにする（`aria-hidden` は Testing Library の `getByRole` が要素を除外してテストが壊れるため使わない）。
- `src/components/layout/ToolTabs.tsx` — 本文上のページ切替タブ。`toolId` から registry の `nav` を `.pt-tab` の `NavLink` で描画し、`ToolLayout` の `tabs?: boolean`（既定 false）で有効化する。nav 項目に `shortLabel` があるタブは 48rem 未満で短いラベル（例: 「ファイル管理」→「管理」）に切り替える（両方の span を描き CSS で表示を切替。`aria-label` は常にフルの `label`。`ToolMenu` は `shortLabel` を使わない）。ドロワー内の機能ナビとは併存の仕様で、my-todo・prompt-builder は有効、credit-csv は無効。見た目は styles.css の `.tool-layout-tabs`／`.pt-tab` に集約する。
- 各ツールの `index.tsx`（または `<Tool>Routes.tsx`）は `<ToolLayout>` の内側（`.<tool>-app[data-theme]` の配下）で `AlertProvider`/`ConfirmProvider`（必要なら `TodoProvider`/`AppDataProvider` 等の状態 Provider）をラップする。`ToolLayout` の外側に置くと、トースト/ダイアログが `.<tool>-app` と兄弟要素になり `[data-theme]` スコープの CSS 変数を継承できないため。
- `src/components/RowMenu.tsx` — 行操作を「⋯」に集約する共通オーバーフローメニュー（my-todo の行、prompt-builder のワード行）。`items: RowMenuItem[]` を受け取り、外側クリック・Escape で閉じる。スタイルは styles.css の `.row-menu-*`。
- `src/components/feedback/` — 3ツール共通の UI フィードバック（`AlertProvider`/`useAlert` トースト、`ConfirmProvider`/`useConfirm` 確認ダイアログ、`Spinner`）。
- `src/hooks/useRevalidateOnReturn.ts` — タブに戻ったとき（`visibilitychange` で visible 化／`window` の `focus`）に callback を呼ぶ共通フック。3ツールの状態 Provider（Bill Manager／My Todo／Prompt Builder、後述）がタブ復帰時の再取得に使う。
- `src/hooks/useGatedSave.ts` — 「変更ごと即時 PUT＋1秒ゲート＋in-flight 直列化・失敗時は自動リトライしない」保存ゲートの共通フック（`useGatedSave({state,stateRef,ready,save,onError})`）。`TodoContext`／`LedgerContext` が使う（後述）。1秒ゲートの `pendingTimer` 待ち・in-flight 中の変更は、タイマー発火前にタブを閉じる・別ページへ遷移すると送られず失われるため、`pagehide` とアンマウント時に未送信分を即時 `keepalive:true` で flush する（best-effort、in-flight 中なら完了を待ってから送る）。この「待つ」は意図的な設計で、待たずに送ると古い内容が後着して勝つリスクと二重送信が生じるため、二重送信・後着上書きの防止を優先する（Prompt Builder の `useAutoSave` の flush と同じ方針）。そのため in-flight 中（数百ms）に編集して直後にページを閉じた場合、その分の変更は送られず失われ得る。`save` は `(state, options?: {keepalive?:boolean}) => Promise<unknown>` を受け取る。
- `src/lib/api.ts` — 各ツール `api.ts` 共通の `{ ok, data }` レスポンス読み取り（`readResult`）と、`fetch` の `keepalive`（ボディ約64KiB超で失敗するため60KiB以下のときだけ付与）を判定する `keepaliveInit(body)`。60KiB を超えるボディは `keepalive` 無しの通常 `fetch` で best-effort 送信する（ブラウザの keepalive／sendBeacon はどちらも約64KiB上限で、それを超えて unload 後も確実に送れる代替が無いため）。保留の窓は1秒ゲート分のみで、Bill Manager の ledger は現状 約16KB 程度のため実運用では上限に達しない想定（Prompt Builder の words も同じ既知の制約）。ツール固有の `API_BASE`・エンドポイント関数は各ツールの `api.ts` に残す。
- `src/lib/mountTool.tsx` — 各クライアントエントリ共通の `createRoot(document.getElementById('root')!).render(app)` 定型（**hydrate ではなく createRoot**。ツールシェルは空 `#root` を返すため）。
- `src/lib/copyText.ts` — iOS/WebKit 向けのクリップボードコピー（同期 `document.execCommand('copy')` を先に試し、失敗時のみ非同期 Clipboard API にフォールバック）。単一ツールでしか使わなくても「特定の処理」は分離してテストを付ける方針の一例。
- `src/lib/credit-csv/` — CSV パース・店名正規化・型（`csv.ts`／`format.ts`／`types.ts`）。react 非依存の純粋ロジックで、credit-csv と Bill Manager（issue #18）の両方から import する横断モジュール。ツール間で `src/tools/<A>/` → `src/tools/<B>/` の import はしない（`src/tools/tool-boundary.test.ts` が検出する）。**`src/lib/` からは `src/tools/`（`registry.ts` を含む）を import しない**（同じく `tool-boundary.test.ts` が検出する。`src/lib` は完全にツール非依存を保つ）。
- `src/public/` — 静的資産。`styles.css`（TOP・全ツールのシェルが常時 link）は Git 管理、`assets/`（ビルド生成物）は gitignore。**共有 UI の CSS（`.fbk-*`／`.tool-layout-*`／`.theme-toggle`／`.pt-*` 共通部品）は styles.css に置く**：コンポーネント側で `import './x.css'` すると Vite が共有チャンクの CSS（例 `assets/ConfirmProvider.css`）に分割し、シェルはツール別バンドルの CSS（`client-credit-csv.css`／`client-prompt-builder.css`／`client-my-todo.css`）しか link しないため**本番で無スタイル化**する（トースト/ダイアログ・ドロワーが素の状態で描画される）。常時 link される styles.css に置けば dev/prod とも確実に読み込まれる。

### デザイントークン（`src/public/styles.css`）

- 色・余白・角丸・影・フォントサイズを `--pt-*` の1系統で `:root` に定義する（ツール別トークンの独自定義はない）。ダークは `@media (prefers-color-scheme: dark)` 内の `:root:not([data-theme="light"])` と、`:root` に紐付けないベア属性セレクタ `[data-theme="dark"]` の両方で同じ値を上書きする。TOP は `<html data-theme>`（`src/ui/theme.ts` が付与）、各ツールは `ToolLayout` が付ける `.<tool>-app[data-theme]` に切り替え用の `data-theme` が乗るため、ベア属性セレクタにすることでどちらの要素にもそのまま属性セレクタとしてヒットし、子孫に継承させている。`color-scheme` と地色（`color`/`background`）は文書ルート限定の設定なので `:root` にのみ置き、`.<tool>-app` には波及させない。
- フォントスタックは全 CSS 共通で `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`（`system-ui` は最後）。Windows の Chrome では `system-ui` の太字が別書体に解決されて数字が可変幅になり `tabular-nums` も効かないため、"Segoe UI" を先に置いて太字でも桁幅を揃える。
- `:root` に `scrollbar-gutter: stable` を置き、縦スクロールバーの有無でビューポート幅が変わって中央寄せの本文が横にずれる（Windows の Chrome/Edge でページ切替時に起きる）のを全ページで防ぐ。
- ブレークポイント（デスクトップ切替）は 48rem（≒768px）固定。カスタムプロパティは `@media` の条件式に使えないため、値は各所に直書きする。
- ボタン・入力欄・カード・バッジ・タブ・テーブルの基本部品は `.pt-button`／`.pt-button-danger`／`.pt-button-accent`／`.pt-input`／`.pt-card`／`.pt-badge`／`.pt-tab`／`.pt-table`／`.pt-status-message`（＋`-error`）／`.pt-empty` として styles.css に集約する。各ツール CSS はツール固有のレイアウトだけを持つ。

### ビルド設定（`vite.config.ts`）とバンドル方針

- `rollupOptions.input` は `registry.ts` の一覧（各ツールの `entry.name`／`entry.src`）から生成し、`theme`（`src/ui/theme.ts`）だけ固定で追加する。
- `manualChunks` はパッケージ名でベンダーチャンクを分離する: `react`／`react-dom`／`scheduler` → `vendor-react`、`react-router`／`react-router-dom` → `vendor-router`、`@dnd-kit/*` → `vendor-dnd`、recharts とその依存一式（`recharts-scale`／`victory-vendor`／`react-smooth`／`d3-*` 等）→ `vendor-recharts`。pnpm の仮想ストア構造（`node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...`）に対応するため、最後の `node_modules/` 以降の先頭セグメントでパッケージ名を判定する。
- 各ツールの重いページは `React.lazy` + `Suspense` で遅延読込し、初期チャンクから外す（credit-csv: recharts を使う `DetailPage`／`MerchantPage`／`YearlyPage`、prompt-builder: @dnd-kit を使う `OutputPage`）。ルートを跨いで状態を持ち上げる場合は「常時マウント＋CSS 切替」ではなく Context（`AppDataProvider`／`TodoProvider` 等）を使う。**常時マウント＋CSS 切替のパターンは使わない**（lazy 化した意味が無くなるため）。
- `outDir:'src/public'`／`emptyOutDir:false`／`publicDir:false`（この2フラグは `src/public/styles.css` を消さないために必要）。出力名はハッシュなし安定名（`entryFileNames:'assets/[name].js'`、`assetFileNames:'assets/[name][extname]'`）でシェルの参照名を固定する。

### Credit CSV Viewer（`src/tools/credit-csv/`）

クレジットカード明細 CSV（Shift_JIS の `YYYYMM.csv`）をアップロードして利用月ベースで集計・閲覧するツール。移植元は別リポジトリ `CatBloom/credit-csv-viewer`。

- CSV パース（`csv.ts`）・店名正規化（`format.ts`）・型（`types.ts`）は `src/lib/credit-csv/` に置く横断モジュール（後述「共有 UI・レイアウト」節）。移植元からほぼそのまま移植。**CSV の読込は `buildAppData(files)`**（アップロード済みバイト列から構築。移植元の `loadAppData`/`import.meta.glob` は廃棄）。`lib/selectors.ts` — チャート用の絞り込み・集計。credit-csv 専用のため `src/tools/credit-csv/lib/` に残す。
- UI（`.tsx`、新規再設計）: `index.tsx` が default export `CreditCsvApp`（自己完結、`credit-csv.css` を import）。`CreditCsvRoutes.tsx` が `<ToolLayout toolId="credit-csv" appClassName="credit-csv-app" tabs>` でラップし、本文上に 明細／年間合計／ファイル管理 のタブを出す。画面は 明細／年間合計／ファイル管理＋店名別（`/merchant/:merchant`）。チャートは **recharts（クライアント専用・lazy）**。未知の内部パスは `/` にリダイレクト。
- テーマ切替は共通 `useTheme`/`ThemeToggle`（`.credit-csv-app[data-theme]` にスコープ）。
- CSV アップロード・アップロード済み一覧・一覧からの削除。

### Prompt Builder（`src/tools/prompt-builder/`）

画像生成プロンプトの「ワード」をタグで管理し、選択順に並べてカンマ区切りで組み立て・コピーするツール。**UI に「NovelAI」表記は出さない**。ワードは**分類を持たない共有プール**（タグ12種で絞り込み管理）。保存履歴には**ターゲット属性**（`HistoryEntry.target`＝どの入力欄に貼るか。3値: `base` / `character` / `negative`）を付ける。ページは `/words`（ワード一覧）・`/register`（登録）・`/output`（出力組み立て）の3つで、不明パス（旧分類パス含む）は `/words` へリダイレクト。

- `shared/` — **react 非依存の純粋モジュール**（`targets.ts` は履歴ターゲットの ID／ラベル／`isPromptTargetId`、`tags.ts` はタグ12種（アルファベット順＋others 最下）と `normalizeTag`、`limits.ts` はワードプールの保存上限 `MAX_WORDS`（=2000。クライアントの先回りチェックとサーバーのバリデーションで同値を共有する）、`types.ts` の `PromptWord = {id,text,description,tag}`／`OutputItem = {id,wordId,text,weight}`／`HistoryEntry = {id,name,createdAt,target,items}`）。**サーバー route からも import する**ため JSX を含めない。
- `lib/notation.ts` — 純粋ロジック（`applyNotation`：weight 正=`{}`／負=`[]` の重ね掛け段数・±5 クランプ、`buildOutput`：カンマ結合、`reorder`）。`lib/parsePrompt.ts` — 完成形のプロンプト文字列（`AAAA,BBBB,{{CCCC}}` 形式）をワード分解する純粋ロジック（`parsePrompt(input): ParsedPromptToken[]`＝`{text,weight}[]`）。区切りはカンマのみ、各トークンの先頭側カッコの連続だけで weight を決め（`{`連続=正、`[`連続=負、混在は0、末尾は見ない）、±5にクランプする。`lib/outputStorage.ts` — **組み立て中の**出力欄状態を localStorage に永続化。キーは単一の `prompt-builder:output`。WordsPage の「出力に追加」・RegisterPage の「出力へ」は `readOutputItems`/`writeOutputItems` で localStorage を直接読み書きする。
- **保存履歴**：組み立てた出力を名前付きスナップショット（`HistoryEntry`、保存時に `target` をセレクトで選択）として **KV に保存**するライブラリ。出力ページ・現在の出力の下に配置し、保存・復元（現在の出力を置換）・削除・名前編集ができ、一覧は target のバッジ表示＋絞り込みに対応。KV キーは単一の `history`（サーバーは `src/server/storage/prompt-builder/` の履歴ストレージ）。**組み立て中の出力は localStorage・保存した履歴は KV** と役割が分かれる。
- **ワード状態（`state/WordsProvider.tsx`）**: ワード一覧・登録の両ページから共有する Context（`WordsProvider`/`useWords`。My Todo の `TodoProvider` と同じ ref による stale closure 対策の書き方）。`words`・`loadStatus`・`dirty`・`saveStatus`・`saveWords`・`addWords(candidates): {ok:true}|{ok:false,reason:'limit'}`（ワード数上限 2000 のチェックはここ1箇所に集約し、単発登録・一括登録の全経路がここを通る）・`updateWord`・`deleteWord` を提供する。`index.tsx` では `AlertProvider`/`ConfirmProvider` の内側・`Routes` の外側に配置し、タブを切り替えても（アンマウントされないため）ワードの未保存変更を保持する。保存ボタン・未保存バッジ・保存エラー表示・読み込みエラー＋再読み込みは共通コンポーネント `components/WordSaveControls.tsx`（`WordSaveButton`/`WordSaveError`/`WordLoadError`）にまとめ、ワード一覧・登録の両ページで使う。`useRevalidateOnReturn` でタブ復帰時に再取得する（`dirty` が false かつ保存中でないときだけ。取得結果が異なれば `words` を差し替えるが `dirty` は false のままなので自動保存は発火しない）。保存履歴（`OutputPage` が読み込む `HistoryEntry[]`）も同様にタブ復帰時へ再取得を入れる（履歴は明示操作でのみ PUT するため、置き換え自体が保存を誘発することはない。保存/削除/更新の進行中や編集中は行わない）。KV は丸ごと置換方式でサーバー側に版チェックが無く、複数タブ・別デバイスからの編集の「後勝ち」上書きを防ぐための対策。
- UI（`.tsx`）: `index.tsx` が default export `PromptBuilderApp`（`prompt-builder.css` を import）。`<ToolLayout toolId="prompt-builder" appClassName="prompt-builder-app">` でラップし、直下にナビタブ「ワード一覧」「登録」「出力」（registry の `nav` から `ToolMenu` が生成）。デスクトップ（48rem 以上）はタブ・本文を `max-width: 1040px` で中央寄せ。`WordsPage` — 一覧・検索・タグ絞り込み（初期値「ALL」＝タグ見出し付きグループ表示、特定タグでフラット表示）のみを持つ（登録フォームは `RegisterPage` 側）。ワード行（ワード＋説明の2行、スマホでも同じ高さ）はクリックで出力に追加し、編集・削除は共通 `RowMenu`（⋯）に集約する。`RegisterPage`（見出し「ワード登録」） — 上段は1語ずつの登録フォーム（タグ未選択の間は追加ボタン disabled）。下段はワード分解：textarea の値から `parsePrompt` で**自動的に**（ボタン無し）行を `useMemo` 導出する。行ごとの編集（text／タグ／説明）は「元 text＋同一 text 内の出現順」をキーにした Map（`rowEdits`）で保持し、textarea が変わって再分解されても同じ元トークンが残っていれば編集を引き継ぐ（表示 text はユーザー編集があればそれ、無ければ元トークンの text）。行は上段フォームと同じ2行構成（1行目: text input＋✕ボタン、2行目: 説明 input＋タグ select）。✕（`aria-label="この行を外す"`、`.pt-button-danger` の赤ボタン）は確認ダイアログ（`useConfirm`。OutputPage の出力アイテム削除・履歴削除と同じ文言トーン）を経てそのトークンを textarea からも取り除く：残りの行を `applyNotation(元text, weight)` で元の記法に戻し `', '` で再結合して textarea を置き換え、`useAlert` のトーストで通知する（既登録の行でも押せる）。既登録（words内にtrim後完全一致のtextがある）行は text/説明/タグの入力欄を disabled にし `title="既に登録されています"` を付けて半透明にする（バッジ文字は出さない。個別の「登録」ボタンや `registered` ローカル state は持たず、`words` への追加で自動的にこの表示に切り替わる）。「すべて追加」は未登録（既登録でなく text が trim 後に空でない）行だけを1回の `addWords` で追加し、対象0件または `loadStatus !== 'ready'` で disabled（ボタン名は上段フォームの「追加」と揃える）。「出力へ」は行**全体**（ユーザー編集後の text・元トークンの weight）を `OutputItem`（`wordId:null`）にして出力欄を置換し `/output` へ遷移する（行0件で disabled、現在の出力が0件なら即時、1件以上なら確認ダイアログ）。`OutputPage`（lazy） — **@dnd-kit で並べ替え**〈`PointerSensor`＋`TouchSensor` でモバイル対応〉、強調記法付与（−／＋は行内）、カンマ結合＋コピー、保存履歴（保存時に target をセレクトで選択・未選択は保存ボタン disabled、一覧はワードと同じく「ALL＝target 見出し付きグループ表示／特定 target＝フラット表示」の絞り込み、編集で名前と target を変更可・復元/更新/削除はトースト通知）。出力アイテム・履歴・ワードの行は共通クラス `.prompt-builder-row` で同じ規格（2行分の高さ）にし、履歴行は「名前／日付」の2行のみ（target はグループ見出しと絞り込みで示し、行にバッジは出さない）。**行クリック → 確認ダイアログ → 復元 → 出力欄へスクロール**（現在の出力が 0 件のときはダイアログを出さず即時復元）。履歴の名前は必須（保存・編集フォームは空なら disabled、サーバーも空を 400 で弾く）。出力アイテムの削除は行クリック → 確認ダイアログ（`useConfirm`）、履歴の編集・削除は共通 `RowMenu`（⋯）。ワードの `id` はクライアントで採番。出力アイテムの `text` は**選択時点のスナップショット**（ワード編集後も復元が壊れない）。
- **ワードの保存**：手動「保存」ボタン（即時 PUT）＋**デバウンス自動保存**（変更が止まって30秒後にまとめて1回 PUT。`AUTO_SAVE_DELAY_MS`）の併用。1KVキー（`words`）に配列まるごと PUT なので、Cloudflare KV 無料枠（**書き込み1,000回/日・同一キー1秒1回**）を消費しすぎないよう「操作ごと」ではなく「アイドル30秒でまとめて」保存する。保存失敗時は**自動リトライしない**（次のワード編集が `saveStatus` を `idle` に戻して再アーム。放置すると30秒ごとに書き込みクォータを浪費するため）。ツール離脱時（`WordsProvider` のアンマウント）・タブを閉じる/リロードする（`pagehide`）で未保存分が消えないよう best-effort で flush する。デバウンス保存・手動保存・flush はすべて `hooks/useAutoSave.ts` の `performSave` を経由し、先行 request の完了を待ってから次を送る直列化で二重送信・後着上書きを防ぐ。flush の PUT は `pagehide` 後も送信を継続する `keepalive` を付けるが、fetch の keepalive ボディ上限（約64KiB）を避けるため `api.ts` の `KEEPALIVE_BODY_LIMIT_BYTES`（60KiB）を超える場合は付けない。**履歴の保存は明示操作のまま**（自動保存の対象外）。
- テーマ切替は共通 `useTheme`/`ThemeToggle`（`.prompt-builder-app[data-theme]` にスコープ）。
- **@dnd-kit**: `@dnd-kit/core` と `@dnd-kit/sortable` を使う（`OutputPage` のみ）。`@dnd-kit/utilities` は依存に入れず、`useSortable` の `transform` は自前で `translate3d(...)` の CSS 文字列にする（単一リストの並べ替えでは scale 不要）。CSP の `style-src` に `'unsafe-inline'` が必要なのはこの inline transform のため。

### My Todo（`src/tools/my-todo/`）

今日やること（Today）といつかやること（Someday）を分けて管理する Todo リスト。ページは `/today`・`/someday`（既定 `/today`、不明パスはリダイレクト）で、切替は `ToolLayout` のナビ（registry の `nav`）から行う。

- `shared/types.ts` — react 非依存の型（`TodoItem`／`TodoState = {today,someday,lastRolloverDate}`／`TodoSectionId`）と `TODAY_LIMIT`（`= 5`。Today に置ける**未完了**アイテムの上限。完了済みはカウントしない）。**サーバー route からも import する**ため JSX を含めない。
- `state/TodoContext.tsx` — Today/Someday の状態を1箇所に持ち上げ、ページ（ルート）を切り替えても保持する。保存ゲート（Cloudflare KV の「同一キー1秒1回」制約を守る1秒ゲート・in-flight 直列化・失敗時は自動リトライしない）は共通 `useGatedSave` に委譲する。`useRevalidateOnReturn` でタブ復帰時に再取得する（`useGatedSave` の `hasPendingChanges()` が true の間は何もしない。取得結果に初回読み込みと同じ経路で rollover を適用し、現在と等価なら何もしない。異なれば state を差し替え、rollover 自体が変化を生んだ場合のみ `markSynced` を呼ばず通常どおり保存する）。KV は丸ごと置換方式でサーバー側に版チェックが無く、複数タブ・別デバイスからの編集の「後勝ち」上書きを防ぐための対策。1秒ゲート待ちの変更もタブを閉じる・離脱する前に `useGatedSave` の pagehide flush が送るため、タイマー発火前に失われる経路は閉じている。
- `lib/rollover.ts` — 日付が変わったときに1日1回だけ適用する繰り越しの純粋関数。同一日（`lastRolloverDate` が今日と一致）なら state をそのまま返す（no-op）。`lastRolloverDate` が `null`（初回起動）は日付を記録するだけでアイテムは動かさない。それ以外（日付が変わった）は全セクションの完了済みアイテムを削除し、Today に残っていた未完了アイテムを Someday の末尾へ移動する。
- `lib/move.ts` — セクション間移動の純粋関数（`moveItem`）と Today の上限判定（`canPlaceInToday`／`countUnfinished`）。移動できない場合は state をそのまま返す（参照不変で no-op を表す）。
- `lib/reorder.ts` — 同一セクション内の並べ替えの純粋関数。
- 行の操作（セクション間移動・編集・削除）は共通 `src/components/RowMenu.tsx`（⋯）に集約する（モバイルでのタスクテキスト表示幅を確保するため、行に個別ボタンを並べない）。
- UI: `index.tsx` が default export `MyTodoApp`（`my-todo.css` を import、`<ToolLayout toolId="my-todo" appClassName="my-todo-app">` でラップ）。`SectionPage` が追加フォーム・@dnd-kit（`PointerSensor`＋`TouchSensor`＋`KeyboardSensor`）での並べ替え・完了チェック・インライン編集・削除・セクション間移動を提供する。テーマ切替は共通 `useTheme`/`ThemeToggle`（`.my-todo-app[data-theme]` にスコープ）。

### Bill Manager（`src/tools/bill-manager/`）

固定費・特殊費用・収入・クレジットカードの月額を合わせて「その月の現金残高（収入−支出）」を見るツール。細かい家計簿ではない。ページは `/`（年間ビュー・既定）・`/year/:year`・`/month`（当月へ `Navigate`）・`/month/:month`（月ビュー）で、不明パスは `/` へリダイレクトする。

- `shared/types.ts` — react 非依存の型・定数。**サーバー route からも import する**ため JSX を含めない。
  - `EntryCategory`（`rent`／`insurance`／`telecom`／`loan`／`investment`／`utility`／`other`。表示は `ENTRY_CATEGORY_LABELS`＝家賃／保険／通信／残債／投資／光熱費／その他）
  - `LedgerEntry = {id,name,amount,category,variable,carryOver,excluded}`（`variable`＝「変動費」＝翌月コピー時に `amount` を `0` にする。`excluded`＝「計上しない」＝記録は残すが固定費合計に含めない）
  - `SpecialExpense = {id,amount,memo}`（特殊費用。翌月へコピーしない）
  - `LedgerMonth = {entries,income,bonus,extraIncome,specials}`（`income`＝給与、翌月へ引き継ぐ。`bonus`＝賞与、`extraIncome`＝臨時収入。どちらも翌月へコピーしない）
  - `LedgerState = {months: Record<支払月YYYYMM, LedgerMonth>}`、構造的な上限（`MAX_MONTHS`／`MAX_ENTRIES_PER_MONTH`／`MAX_SPECIALS_PER_MONTH`／`MAX_ENTRY_NAME_LENGTH`／`MAX_MEMO_LENGTH`／`MAX_ENTRY_AMOUNT`）・`isMonthKey`。
- **データの持ち方**: 支払月ごとに `LedgerMonth` のスナップショットを独立して保存する（マスター無し）。ある月を編集しても他の月には波及しない。
- **月の初期化（`lib/initMonth.ts` の `resolveMonth`、純粋関数）**: 記録の無い月を開いたら、「その月より前で記録がある最新の月」から派生させて表示する。entries は `carryOver:false` を除外・`variable:true` は `amount:0`（`excluded` はそのまま引き継ぐ）、`income` はそのまま引き継ぎ、`bonus`／`extraIncome` は `null`、`specials` は空にする。**表示のための初期化はクライアント計算のみ**（state は書き換えない）で、その月で最初の編集が発生したときに初めて `LedgerContext` が state に書き込み（materialize）て PUT する。
- **集計（`lib/summary.ts` の `summarizeMonth(month, credit)`）**: 固定費合計＝`excluded:false` かつ `amount≠null` の entries の合計、特殊費用合計＝specials.amount の合計、支出合計＝固定費合計＋特殊費用合計＋(クレカ ?? 0)、収入＝(income ?? 0)＋(bonus ?? 0)＋(extraIncome ?? 0)、**現金残高＝収入−支出合計**。未入力の行・クレカ未取込・収入未入力はそれぞれ `missingCount`／`creditMissing`／`incomeMissing` で返す。
- **年間ビュー（`lib/yearGrid.ts` の `buildYearGrid(state, year, credits)`）**: 指定年の12か月分を `resolveMonth` で束ね、カテゴリごとの集計行（`categoryRows`。`ENTRY_CATEGORIES` 順、各セルはその月・そのカテゴリの `excluded:false` かつ `amount≠null` の entries 合計、年内に項目が1つも無いカテゴリは行を出さない）・特殊費用行（`specialRow`。月ごとの specials 合計）・月ごとの集計（`months[].summary`＝`summarizeMonth` を年内12か月分）・年間合計（`totals`＝クレカ／支出合計／収入／現金残高の4値）を返す。クレカ未取込の月（`summary.creditMissing`）は `months[].expenseTotal`／`cashRemaining` が `null` になり、`totals` の4値はその月を除いて合算する（カテゴリ行・特殊費用行・各月の収入は対象外）。
- **クレカ額（`lib/creditAmount.ts`／`creditCsvApi.ts`）**: 支払月 M のクレカ額 = 同じ月 M の credit-csv ファイル `YYYYMM.csv` の合計（credit-csv 側で請求月に合わせて命名済みのためずらさない。`sumCreditCsv` が `src/lib/credit-csv/csv.ts` の `parseUploadedCsv` を使って集計）。**手入力は禁止**。`creditCsvApi.ts` の `fetchCreditCsvBytes` が credit-csv の API（`GET /tools/credit-csv/api/files/<YYYYMM>.csv`、URL のベースは `registry.ts` の `TOOLS` から引く）を同一オリジンで fetch する（200 → 集計、404 → 未取込 = `null`）。**KV には保存せず、表示のたびに毎回計算する**。`src/tools/credit-csv/` 配下は直接 import しない（`src/tools/tool-boundary.test.ts` が検出する）。
- `lib/monthKey.ts` — 支払月キー（YYYYMM）の加減算・整形の純粋関数（`shiftMonth`／`currentMonthKey`／`formatMonthLabel`／`yearOf`／`monthsOfYear`）。
- `lib/format.ts` — 金額表示の共通フォーマット（`formatYen`／`formatAmountOrDash`）。`MonthPage`／`YearPage`／`SpecialRow` から使う。
- `lib/amount.ts` — 金額入力欄のパース（`parseAmountInput`。空欄は `null`、非数値は `null`、小数は切り捨て）。
- `state/LedgerContext.tsx` — 支払月ごとのスナップショットを1箇所に持ち上げ、ページを切り替えても保持する（`useLedger`）。保存ゲートは `TodoContext` と同じ共通 `useGatedSave` に委譲する。選択中の支払月（`month`／`setMonth`）・選択中の年（`year`／`setYear`）・その月の解決済み記録（`currentMonth`／`currentMonthSource`）・支払月ごとのクレカ額キャッシュ（`creditByMonth: Record<YYYYMM, number|null|undefined>`。`undefined`＝未取得、`null`＝未取込。選択月・選択年の12か月分を自動でまとめて取得する）・操作（`addEntry`／`updateEntry`／`removeEntry`＝選択中の支払月に対して、`setIncome`／`setBonus`／`setExtraIncome`／`addSpecial`／`updateSpecial`／`removeSpecial`＝対象月を明示的に指定）を提供する。月ビューでの月移動や `/month/:month` の直接オープンで選択月が変わったら、`setMonth` が選択中の年も追従させる（`/year/:year` で明示された年はこの同期の対象外で従来どおり優先）。`useRevalidateOnReturn` でタブ復帰時に再取得する（`useGatedSave` の `hasPendingChanges()` が true の間は ledger の再取得はしない。取得結果が現在と等価なら何もせず、異なれば state を差し替えつつ `markSynced` で同じ値に揃えて PUT を発火させない）。クレカ額は別タブでの CSV 取込を拾うため、ledger の未保存変更の有無に関わらずタブ復帰のたびに選択中の月・選択中の年12か月分を要求済みマークを外して再取得する（取得済みの値は新しい結果が届くまで保持する）。KV は丸ごと置換方式でサーバー側に版チェックが無く、複数タブ・別デバイスからの編集の「後勝ち」上書きを防ぐための対策。
- UI: `index.tsx` が default export `BillManagerApp`（`bill-manager.css` を import、`<ToolLayout toolId="bill-manager" appClassName="bill-manager-app" tabs>` でラップ）。ナビタブは「年間」「月」（registry の `nav`）。数字は `.bill-manager-app` と金額 input（`.bill-manager-amount`。UA の `font` 指定で継承が切れるため個別指定）に `font-variant-numeric: tabular-nums` を当て、同じ桁数の金額の幅を揃える。
  - `YearPage`（既定画面）: `.pt-table` ベースの表。行＝**カテゴリ集計**（項目単位の行は無い。`ENTRY_CATEGORIES` 順、`excluded` の項目は集計に含めない。年内に項目の無いカテゴリは行を出さない）、列＝1〜12月＋年間合計。カテゴリ行の下に「特殊費用」行、その下に集計行（クレカ／支出合計／収入／**現金残高**の4行。「固定費合計」の行は無い）。支出合計以下の3行は太い罫線（`bill-manager-year-result-row-first`）と背景色（`bill-manager-year-result-row`。`--pt-info-bg` トークン、ダークでも成立）で集計結果と分かるようにし、現金残高（`bill-manager-year-cash-row`）は太字で強調する。**クレカ未取込の月**は支出合計／現金残高のセルを「—」で表示し（クレカのセルは従来どおり「未取込」。収入のセルはそのまま数値を出す）、右端の年間合計はクレカ／支出合計／収入／現金残高の4行ともその月を除いて合算する（カテゴリ行・特殊費用行は影響を受けない）。除外がある年はカード下部に注記を1つ出す（`buildYearGrid` が `months[].expenseTotal`／`cashRemaining` を null で返す）。記録の無い月はセルを薄い色で表示する（列見出しにタグは付けない）。スマホでは項目名列を `position: sticky` で固定し横スクロールする。月見出しはその月の月ビューへのリンク。前年／翌年ボタン。
  - `MonthPage`: 1項目1行のコンパクト表示（`components/MonthEntryRow.tsx`。名前→状態バッジ（変動費／終了。`excluded` は**バッジを出さず**打消し線＋薄い表示だけで示す）→カテゴリバッジ→金額入力→`RowMenu`〈⋯〉の順に1行に収める）。名前・カテゴリの編集は「編集」の単一モードにまとめ、行を名前 input＋カテゴリ select（カテゴリは2〜3文字ラベルのため幅を詰める）＋右寄せの保存／キャンセルへ一時的に差し替え、375px でも1行に収める。`excluded` の行は名前・カテゴリ・金額など**入力側だけ**を薄く（＋打消し線）し、`RowMenu` のボタン・ポップアップは通常の濃さで表示する（行全体に `opacity` を掛けない）。前月／翌月ナビ。集計カード（収入合計／支出合計＋内訳1行／**現金残高**〈強調〉、注記は未入力・クレカ未取込・収入未入力があるときだけ1行）。収入行（給与の金額入力＋`RowMenu`〈⋯〉で賞与・臨時収入をそれぞれ追加・編集、あれば行内に「＋賞与」「＋臨時収入」の順で小さく併記）。金額 input（項目・給与）は非制御（`defaultValue`＋blur 確定）のため、`key` に `useLedger().month`（コンテキストの選択月）を含めて月の切替で必ず作り直す。項目 `id` は派生コピー・取込データで月をまたいで同じになるので `id` だけの key では前の月の表示値が残る。URL 由来の月は `currentMonth` より1描画早く変わるため key に使わない。項目一覧の `RowMenu`: 編集／変動費／クレカ払い（`excluded` のトグル。クレカ明細に含まれているため支出合計から除外する意）／今月終了／削除（`useConfirm`）。文言は状態に関わらず固定（ON/OFF 表記はしない。状態はバッジ・打消し線で示す）。特殊費用（`components/SpecialRow.tsx`、金額＋メモの小さな行、追加・削除のみ）。追加フォームは名前・金額・カテゴリ（select）・追加を1行に（スマホは折り返し可）。変動費は登録後に `RowMenu` の「変動費」で切り替える（追加フォームにチェックは置かない）。`currentMonthSource === 'derived'` の注記あり。**編集可否**（UI 側のルール、`lib/monthKey.ts` の `isMonthEditable(month, currentMonthKey())`）: 今日の月とその翌月までは編集可、翌々月以降は編集不可。編集不可の月は項目・給与の金額 input を `disabled`（`MonthEntryRow`/`SpecialRow` に `editable` prop を渡す）にし、項目・給与・特殊費用の `RowMenu` と追加フォーム・特殊費用の削除ボタンを描画しない。賞与／臨時収入の編集フォームは月の切替で `editable` が false になったら自動で閉じる。注記「翌々月以降は編集できません。前の記録月からの見込みを表示しています。」を出し、`derived` の注記とは同時に出さない。サーバー側では強制しない（`TODAY_LIMIT` と同様）。
  - テーマ切替は共通 `useTheme`/`ThemeToggle`（`.bill-manager-app[data-theme]` にスコープ）。

### ストレージ共通骨格（`src/server/storage/shared/`）

- `kv-client.ts` — Cloudflare Workers KV REST の薄いラッパー `CloudflareKvClient`（`getJson`/`putJson`/`request`）。各ツールの KV ストレージ実装はこの上に積む。credit-csv の value+metadata 形式の一覧取得だけはこの形に合わないため `request()` を直接使う。
- `select-storage.ts` — `selectByEnv(options)`：Account ID＋ツール別 Namespace env＋API Token が揃えば KV 実装、揃わなければ Local 実装を返す判定を共通化する。各ツールの `select*Storage()` はこの関数へ `namespaceEnv`／`kv`／`local` を渡すだけ。
- 環境変数は Account ID（`CLOUDFLARE_ACCOUNT_ID`）と API トークン（`CLOUDFLARE_KV_API_TOKEN`）を全ツールで共有し、Namespace のみツールごとに `CLOUDFLARE_KV_<TOOL>_NAMESPACE_ID` 形式で別立てする（credit-csv: `CLOUDFLARE_KV_CREDIT_NAMESPACE_ID`、prompt-builder: `CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`、my-todo: `CLOUDFLARE_KV_TODO_NAMESPACE_ID`、bill-manager: `CLOUDFLARE_KV_BILL_NAMESPACE_ID`）。**サーバー専用・`process.env` からのみ・クライアントに絶対混入させない**。

### Credit CSV ストレージ（`src/server/storage/credit-csv/`）

`CreditCsvStorage` インターフェース（`list/get/put/delete`、`StoredFileMeta = {name,size,uploadedAt}`）と2実装 `LocalCreditCsvStorage`（gitignore した `.data/` にファイル保存）／`CloudflareKvCreditCsvStorage`。`selectCreditCsvStorage()` は `CLOUDFLARE_KV_CREDIT_NAMESPACE_ID` を使って `selectByEnv` に委譲する。ファイル名は必ず `^\d{6}\.csv$`（`assertValidFileName`）で検証してからパス/キーに使う（パストラバーサル対策）。Vercel Serverless のボディ上限（約4.5MB）のため、アップロードは **4MiB 上限**。本番運用には Cloudflare KV の別途設定が必要（未設定のうちは Local フォールバックのみ）。

### Prompt ストレージ（`src/server/storage/prompt-builder/`）

Prompt Builder 専用。ワード用と履歴用の2系統で、どちらも**同じ KV Namespace／同じ env**（`CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`）を使い、キー名で分ける。
- ワード：`PromptWordStorage`（`getWords/putWords`、`PromptWord[]` を丸ごと読み書き）。KV キーは単一の `words`、Local は `.data/prompt-builder/words.json`。
- 履歴：`PromptHistoryStorage`（`getHistory/putHistory`、`HistoryEntry[]` を丸ごと読み書き）。KV キーは単一の `history`、Local は `.data/prompt-builder/history.json`。
- 実装は各 `LocalPromptWordStorage`／`CloudflareKvPromptWordStorage`／`LocalPromptHistoryStorage`／`CloudflareKvPromptHistoryStorage`。`selectPromptWordStorage()`／`selectPromptHistoryStorage()` はどちらも `CLOUDFLARE_KV_PROMPT_NAMESPACE_ID` で `selectByEnv` に委譲する。履歴の `target` は route 層で `isPromptTargetId` により検証する。

### Todo ストレージ（`src/server/storage/my-todo/`）

My Todo 専用。`MyTodoStorage`（`getTodos/putTodos`、`TodoState` を丸ごと読み書き）と2実装 `LocalMyTodoStorage`（`.data/my-todo/todos.json`）／`CloudflareKvMyTodoStorage`。KV キーは単一の `todos`。`selectMyTodoStorage()` は `CLOUDFLARE_KV_TODO_NAMESPACE_ID` で `selectByEnv` に委譲する。

### Bill ストレージ（`src/server/storage/bill-manager/`）

Bill Manager 専用。`BillManagerStorage`（`getLedger/putLedger`、`LedgerState` を丸ごと読み書き）と2実装 `LocalBillManagerStorage`（`.data/bill-manager/ledger.json`）／`CloudflareKvBillManagerStorage`。KV キーは単一の `ledger`。`selectBillManagerStorage()` は `CLOUDFLARE_KV_BILL_NAMESPACE_ID` で `selectByEnv` に委譲する。

### CSV アップロード API（`src/server/routes/credit-csv.ts`）

`createCreditCsvRoutes(storage?)` が Hono サブアプリを返す（`/tools/credit-csv/api` にマウント）。`GET/POST /files`（POST は multipart、field `file`）、`GET/DELETE /files/:name`。バリデーション: ファイル名 `^\d{6}\.csv$`（不正 400）、4MiB 超 413、非 multipart 415、未存在 404。CSV は生バイトのまま保存し、デコード（Shift_JIS）・パースはクライアントで行う。

### ワード API（`src/server/routes/prompt-builder.ts`）

`createPromptBuilderRoutes(storage?, historyStorage?)` が Hono サブアプリを返す（`/tools/prompt-builder/api` にマウント）。
- ワード：`GET /words`（共有プールのワード一覧）、`PUT /words`（JSON `{ words }` で丸ごと置換）。
- 履歴：`GET /history`（保存履歴一覧）、`PUT /history`（JSON `{ entries }` で丸ごと置換。各エントリの `target` は `isPromptTargetId` で検証、`name` は trim 後に空でないこと）。
- バリデーション: 非 JSON 415、payload 不正（`target` 不正・`name` 空を含む）400、ボディ 4MiB 超 413、ワード数 2000 超／履歴エントリ数 200 超 413。`{ ok, data }` 規約は共通。

### Todo API（`src/server/routes/my-todo.ts`）

`createMyTodoRoutes(storage?)` が Hono サブアプリを返す（`/tools/my-todo/api` にマウント）。`GET /todos`（現在の状態。未保存なら空状態）、`PUT /todos`（JSON `{ state }` で丸ごと置換）。バリデーション: 非 JSON 415、payload 不正 400、アイテムの `text` 長 1000 文字超は無効、`today`+`someday` の合計アイテム数 500 件超 413、ボディ 4MiB 超 413。`TODAY_LIMIT`（Today 未完了5件まで）は UI 側のルールでサーバー側では強制しない。

### Ledger API（`src/server/routes/bill-manager.ts`）

`createBillManagerRoutes(storage?)` が Hono サブアプリを返す（`/tools/bill-manager/api` にマウント）。`GET /ledger`（現在の状態。未保存なら空状態）、`PUT /ledger`（JSON `{ state }` で丸ごと置換）。バリデーション: 非 JSON 415、payload 不正（月キー不正・`LedgerMonth` の形不正・entry フィールド不正〈`category` が一覧外・`excluded` が boolean でないを含む〉・`income`／`bonus`／`extraIncome` が `null` または 0 以上の整数でない（`bonus` のみ未指定を許容し `null` に正規化）・special の `amount` 不正／`memo` が `MAX_MEMO_LENGTH` 超）400、月数 240 超（`MAX_MONTHS`）／1月あたりの entries 50 超（`MAX_ENTRIES_PER_MONTH`）／1月あたりの specials 50 超（`MAX_SPECIALS_PER_MONTH`）／ボディ 4MiB 超 413。`bonus` は後から追加したフィールドのため未指定を許容し、GET／PUT のレスポンスでは `null` に正規化する（旧データ・旧クライアントとの互換性維持。`extraIncome` は元々スキーマにあったフィールドのため従来どおり必須のまま）。

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

- CSP は単一 middleware でパス分岐: `registry.ts` の `inlineStyle: true` なツール（現状 credit-csv・prompt-builder・my-todo・bill-manager の全ツール）の path 配下だけ `style-src 'self' 'unsafe-inline'`（credit-csv は recharts のインライン style＋Vite の CSS 注入、prompt-builder／my-todo は @dnd-kit の inline transform、bill-manager は Vite の CSS 注入（dev）のため。共通の `inlineStyleSecureHeaders` を使う）、それ以外（TOP 等）は `style-src 'self'`。**`script-src` は全ルート厳格**（dev のみ Vite preamble 用に `'unsafe-inline'`）。TOP に React バンドルを出さないこと（テーマ用 `theme.js` のみ）・ルート別 CSP はテストが検証している。
- API レスポンスは `{ ok:true, data }` / `{ ok:false, error:{ message } }`。エラーメッセージに内部情報を含めない。
- サーバー専用の認証情報（KV トークン等）・`node:fs`・storage コードをクライアントバンドルに入れない（各 `client-*.tsx → <Tool>App → api.ts` の依存に storage を混ぜない。ビルド後 `src/public/assets/client-credit-csv.js`・`client-prompt-builder.js`・`client-my-todo.js`・`client-bill-manager.js` を grep して混入ゼロを確認できる）。

### テスト

vitest + jsdom。サーバーテストは `app.request('http://localhost/...')` で HTTP を通さず検証。`NODE_ENV` を書き換えるテストは `finally` で復元。recharts・@dnd-kit は jsdom で完全描画/ドラッグ再現できないため UI テストではモックし、並べ替えロジックは `lib/reorder.ts`／`lib/notation.ts` の `reorder` など純粋関数を単体で検証する。**実際のカード明細（移植元 `data/*.csv`）はフィクスチャに使わない。合成データのみ**。`src/tools/css-scope.test.ts` は各ツール CSS を走査し、`.xxx-app a` のような「ラッパー＋素の要素セレクタ」だけのルールを失敗させる（共有 UI はラッパー内に描画されるためカスケードで漏れる）。ツール CSS で要素を指定するときはツール固有クラスか `.tool-layout-main` 配下に限定する。`src/tools/tool-boundary.test.ts` は各ツールディレクトリ配下の相対 import/export を走査し、他ツールのディレクトリを直接 import していないかを検証する。

## この構成で守ること

- UI・SSR・静的資産・CSP・ルーティングを変更したら、`pnpm run check` だけで完了としない。dev サーバーで `/`（TOP・script なし）・3ツールのシェル（`/tools/credit-csv` 等）・API・`/styles.css` を実 HTTP 取得し、ブラウザでコンソール／CSP／描画エラーがないことまで確認する。確認できなければ「問題なし」ではなく「未検証」と報告する。
- `requirements.html` がプロダクト要件の正。`AGENTS.md` に責務境界とデリバリー規約（PR は日本語、`## 概要` と `## 説明` の見出し）がある。
- ローカルの進捗メモは `task/` 配下（gitignore 済み・コミット禁止）。エージェントのミスを指摘されたら `task/MISTAKES.md` に追記する。
