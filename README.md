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

品質確認は `pnpm run check`、本番用クライアントの生成は `pnpm run build` です。生成された `public/assets/` は Git 管理しません。

Vercel では Framework Preset を `Hono` にし、Build Command は `pnpm run build` を使用します。Output Directory は override しません。

- [要件定義書](requirements.html)
