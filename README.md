# private-tools

個人で使用する便利ツールを集めたアプリケーションです。

## Architecture

- アプリケーション: Hono SSR、React、Vite、TypeScript
- ホスティング: Vercel
- 本番ブランチ: `main`
- アクセス制御: Cloudflare Access
- 永続ストレージ: 必要になった時点で Cloudflare Workers KV を REST API 経由で使用
- UI: モバイルファースト。デスクトップでも利用可能

## Local development

Node.js 22 で、次を実行します。

```sh
pnpm install
pnpm run dev
```

品質確認は `pnpm run check`、本番用クライアントの生成は `pnpm run build` です。生成された `src/public/assets/` は Git 管理せず、Vercel の Function に含めて `/assets/client.js` から配信します。CSS はルートの `public/` に置き、Hono のプリセットで静的配信します。

Vercel の設定は [`vercel.json`](vercel.json) で管理しています。Framework Preset は `Hono`、Build Command は `pnpm run build` です。Output Directory は設定していません。Hono のプリセットがルートの `public/` を静的ファイルとして自動的に配信します。

- [要件定義書](requirements.html)
