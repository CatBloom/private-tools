# 検証用アプリ

SSR と React の動作を確認するための検証用アプリです。

Hono SSR、React、Vite、TypeScript を使った初期基盤です。アクセス制御はデプロイ時に Cloudflare Access で設定します。アプリ内のアカウント管理や永続データは、個別の Issue で必要になった時点で追加します。

## Local development

Node.js 22 で、次を実行します。

```sh
npm install
npm run dev
```

品質確認は `npm run check`、本番用クライアントの生成は `npm run build` です。生成された `public/assets/` は Git 管理しません。

Vercel では Framework Preset を `Hono` にし、Build Command と Output Directory の override は設定しません。

## API

`POST /api/hello` は JSON の `{ "name": "..." }` を受け取り、挨拶メッセージを返すサンプル API です。入力は 1〜50 文字に制限され、16 KiB を超えるリクエスト本文は拒否します。

- [要件定義書](requirements.html)
