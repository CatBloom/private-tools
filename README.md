# private-tools

個人で使う便利ツールを1つにまとめた、非公開・モバイルファーストの Web アプリケーションです。TOP ページ（ツール一覧）から各ツールへ入る構成で、小さな単位でツールを増やしていけます。

## 収録ツール

- **TOP（`/`）** — ツール一覧のハブ。純 SSR（クライアント JS なし）で、ライト / ダークのテーマ切替つき。
- **Credit CSV Viewer（`/tools/credit-csv`）** — クレジットカード明細 CSV をアップロードして、利用月ベースで集計・閲覧するツール。
  - Shift_JIS の `YYYYMM.csv` をアップロード（選択で自動アップロード）・一覧・削除。
  - 明細 / 年間合計 / 店名別 / ファイル管理 の画面。年・月・店名（部分一致）での絞り込み、円グラフ・折れ線グラフ、店名の正規化・グルーピング。
  - 金額は日本円表記、テーブルは10件ページネーション。
- **Prompt Builder（`/tools/prompt-builder`）** — 画像生成プロンプトの「ワード」をタグで管理し、選択順に並べてカンマ区切りで組み立て・コピーするツール。
  - ワード管理（`/words`）: タグ12種での絞り込み・登録・インライン編集・削除。
  - 出力組み立て（`/output`）: ドラッグ＆ドロップでの並べ替え、強調記法の付与、名前付きスナップショットとしての保存履歴（復元・編集・削除）。
- **MyTodo（`/tools/my-todo`）** — 今日やること（Today）といつかやること（Someday）を分けて管理するシンプルな ToDo リスト。
  - 追加・完了チェック・インライン編集・削除、ドラッグ＆ドロップでの並べ替え、Today ⇔ Someday の移動（Today は未完了5件まで）。
  - 日付が変わると Today の未完了タスクを自動で Someday へ繰り越す。

各ツールは画面左上の ☰ メニューから、そのツール内の機能ナビ・他ツールへの切替・「← ツール一覧」・テーマ切替を行える。

## アーキテクチャ

- アプリケーション: Hono SSR + React + Vite + TypeScript。
- ホスティング: Vercel（本番ブランチは `main`。`main` へのマージで本番デプロイ）。
- アクセス制御: Cloudflare Access（アプリ内アカウント登録は持たない）。
- 永続ストレージ: Cloudflare Workers KV（REST API 経由）。ツールごとに独立した KV Namespace を持つ（Account ID・API トークンは共有）。開発時は KV 環境変数が無ければローカルの `.data/`（Git 管理外）へフォールバックする。
- レンダリング: TOP は純 SSR（クライアント JS なし）。ツールは SSR シェル＋クライアントマウント（recharts・@dnd-kit などクライアント専用の依存のため）。ツールごとにビルドを分離し、重いページ（グラフ・ドラッグ＆ドロップ）は遅延読込する。
- UI: モバイルファースト。デスクトップでも利用可能。3ツールで共通のデザイントークン・基本部品・ヘッダー/メニューを使い、見た目を揃えている。

## ローカル開発

Node.js 24 / pnpm。

```sh
pnpm install
pnpm run dev     # http://localhost:5173
```

- 品質確認: `pnpm run check`（lint → typecheck → test → build）
- 本番用ビルド: `pnpm run build`（クライアントを `src/public/assets/` に生成）
- 生成物（`src/public/assets/`）は Git 管理せず、Vercel の Function に含めて Hono から配信する。

## デプロイと静的配信

- Vercel の設定は [`vercel.json`](vercel.json)（Framework Preset は `Hono`、Build Command は `pnpm run build`）。Output Directory は設定せず、`src/public/` の静的資産は `functions.includeFiles` で Function に同梱する。
- 本番では Hono が `/styles.css` と `/assets/:filename`（`.js` / `.css` / `.map`、パストラバーサル対策あり）を配信する。開発では Vite が配信する。
- CSP は原則 `script-src 'self'` / `style-src 'self'` の厳格設定。recharts（credit-csv）・@dnd-kit（prompt-builder / my-todo）がインライン style を使うため、3ツールの配下のみ `style-src` に `'unsafe-inline'` を許可する。
- ビルドはベンダー（react / react-router / @dnd-kit / recharts）を別チャンクに分離し、各ツールの重いページは `React.lazy` で遅延読込する。

## 本番でストレージを有効化する（Cloudflare KV）

各ツールのデータ保存・一覧・削除を本番で使うには、Cloudflare KV を用意し、Vercel に次の環境変数を設定して再デプロイする（トークンは Vercel の環境変数にのみ置き、コード・Git・ログに残さない）。

- `CLOUDFLARE_ACCOUNT_ID`（全ツール共有）
- `CLOUDFLARE_KV_API_TOKEN`（Workers KV Storage: Edit 権限。全ツール共有）
- `CLOUDFLARE_KV_CREDIT_NAMESPACE_ID`（Credit CSV Viewer 用 Namespace）
- `CLOUDFLARE_KV_PROMPT_NAMESPACE_ID`（Prompt Builder 用 Namespace）
- `CLOUDFLARE_KV_TODO_NAMESPACE_ID`（MyTodo 用 Namespace）

ツールごとに Account ID・API トークン・そのツール専用の Namespace ID の3つが揃うと KV を使用し、揃わない場合はそのツールだけローカルフォールバックになる（Vercel の読み取り専用 FS では書き込みに失敗するため、本番では KV 設定が必須）。

## 参考

- [要件定義書](requirements.html)
- リポジトリで作業する AI エージェント向けの詳細は [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) を参照。
