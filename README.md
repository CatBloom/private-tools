# private-tools

個人で使う便利ツールを1つにまとめた、非公開・モバイルファーストの Web アプリケーションです。TOP ページ（ツール一覧）から各ツールへ入る構成で、小さな単位でツールを増やしていけます。

## 収録ツール

- **TOP（`/`）** — ツール一覧のハブ。ライト / ダークのテーマ切替つき。
- **Credit CSV Viewer（`/tools/credit-csv`）** — クレジットカード明細 CSV をアップロードして、利用月ベースで集計・閲覧するツール。
  - Shift_JIS の `YYYYMM.csv` をアップロード（選択で自動アップロード）・一覧・削除。
  - 明細 / 年間合計 / 店名別 / ファイル管理 の画面。年・月・店名（部分一致）での絞り込み、円グラフ・折れ線グラフ、店名の正規化・グルーピング。
  - 金額は日本円表記、テーブルは10件ページネーション。

## アーキテクチャ

- アプリケーション: Hono SSR + React + Vite + TypeScript。
- ホスティング: Vercel（本番ブランチは `main`。`main` へのマージで本番デプロイ）。
- アクセス制御: Cloudflare Access（アプリ内アカウント登録は持たない）。
- 永続ストレージ: Cloudflare Workers KV（REST API 経由）。開発時は KV 環境変数が無ければローカルの `.data/`（Git 管理外）へフォールバックする。
- レンダリング: TOP は純 SSR（クライアント JS なし）。ツールは SSR シェル＋クライアントマウント（recharts などクライアント専用のため）。
- UI: モバイルファースト。デスクトップでも利用可能。

## ローカル開発

Node.js 22 / pnpm。

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
- CSP は原則 `script-src 'self'` / `style-src 'self'` の厳格設定。recharts のインライン style のため、`/tools/credit-csv` 配下のみ `style-src` に `'unsafe-inline'` を許可する。

## 本番でストレージを有効化する（Cloudflare KV）

CSV の保存・一覧・削除を本番で使うには、Cloudflare KV を用意し、Vercel に次の環境変数を設定して再デプロイする（トークンは Vercel の環境変数にのみ置き、コード・Git・ログに残さない）。

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_KV_CREDIT_NAMESPACE_ID`
- `CLOUDFLARE_KV_API_TOKEN`（Workers KV Storage: Edit 権限）

3つすべてが揃うと KV を使用し、揃わない場合はローカルフォールバックになる（Vercel の読み取り専用 FS では書き込みに失敗するため、本番では KV 設定が必須）。

## 参考

- [要件定義書](requirements.html)
- リポジトリで作業する AI エージェント向けの詳細は [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) を参照。
