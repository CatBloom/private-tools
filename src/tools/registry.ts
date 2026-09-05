// ツール定義の一覧。react 非依存・JSX なしの純データで、サーバー（app.ts）・SSR（TopPage.ts）・
// ビルド設定（vite.config.ts、node から実行）・クライアント共通メニュー（Phase 5b）から import する。
// ツールを増やすときはここに1件追加し、対応する src/client-<id>.tsx エントリを1ファイル追加する。

export type ToolNavItem = {
  label: string
  to: string
}

export type ToolId = 'my-todo' | 'credit-csv' | 'prompt-builder'

export type ToolDefinition = {
  id: ToolId
  name: string
  path: string
  description: string
  // Vite の rollupOptions.input のキーとエントリファイルのパス。
  entry: {
    name: string
    src: string
  }
  // SSR シェルが <script type="module" src="..."> に出すクライアントスクリプト。
  clientScript: {
    dev: string
    prod: string
  }
  // 本番でビルド抽出される、そのツール専用の CSS。
  css: {
    prod: string
  }
  // ツール内の機能ナビ（TOP のカードや将来の共通メニューから使う）。
  nav: ToolNavItem[]
  // true なら CSP の style-src に 'unsafe-inline' が必要（recharts / @dnd-kit のインライン style）。
  inlineStyle: boolean
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'my-todo',
    name: 'MyTodo',
    path: '/tools/my-todo',
    description: 'シンプルなToDoリスト',
    entry: { name: 'client-todo', src: 'src/client-todo.tsx' },
    clientScript: { dev: '/src/client-todo.tsx', prod: '/assets/client-todo.js' },
    css: { prod: '/assets/client-todo.css' },
    nav: [
      { label: 'Today', to: '/today' },
      { label: 'Someday', to: '/someday' },
    ],
    inlineStyle: true,
  },
  {
    id: 'credit-csv',
    name: 'Credit CSV Viewer',
    path: '/tools/credit-csv',
    description: 'カード明細CSVの集計ビューア',
    entry: { name: 'client', src: 'src/client.tsx' },
    clientScript: { dev: '/src/client.tsx', prod: '/assets/client.js' },
    css: { prod: '/assets/client.css' },
    nav: [
      { label: '明細', to: '/' },
      { label: '年間合計', to: '/yearly' },
      { label: 'ファイル管理', to: '/files' },
    ],
    inlineStyle: true,
  },
  {
    id: 'prompt-builder',
    name: 'Prompt Builder',
    path: '/tools/prompt-builder',
    description: '画像生成プロンプトのワード帳',
    entry: { name: 'client-prompt', src: 'src/client-prompt.tsx' },
    clientScript: { dev: '/src/client-prompt.tsx', prod: '/assets/client-prompt.js' },
    css: { prod: '/assets/client-prompt.css' },
    nav: [
      { label: 'ワード', to: '/words' },
      { label: '出力', to: '/output' },
    ],
    inlineStyle: true,
  },
]
