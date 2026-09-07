// ツール定義の一覧。react 非依存の純データで、サーバー・SSR・ビルド設定・クライアント共通メニューから import する。
// ツールを増やすときはここに1件追加し、対応する src/client-<id>.tsx エントリを1ファイル追加する。

export type ToolNavItem = {
  label: string
  to: string
  // 本文上タブ（ToolTabs）のみスマホ幅（48rem 未満）で label の代わりに表示する短縮ラベル。
  // ドロワー（ToolMenu）は常に label を使うため、未指定なら ToolTabs も label のまま。
  shortLabel?: string
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
    name: 'My Todo',
    path: '/tools/my-todo',
    description: 'シンプルなTodoリスト',
    entry: { name: 'client-my-todo', src: 'src/client-my-todo.tsx' },
    clientScript: { dev: '/src/client-my-todo.tsx', prod: '/assets/client-my-todo.js' },
    css: { prod: '/assets/client-my-todo.css' },
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
    entry: { name: 'client-credit-csv', src: 'src/client-credit-csv.tsx' },
    clientScript: { dev: '/src/client-credit-csv.tsx', prod: '/assets/client-credit-csv.js' },
    css: { prod: '/assets/client-credit-csv.css' },
    nav: [
      { label: '明細', to: '/' },
      { label: '年間合計', to: '/yearly' },
      { label: 'ファイル管理', to: '/files', shortLabel: '管理' },
    ],
    inlineStyle: true,
  },
  {
    id: 'prompt-builder',
    name: 'Prompt Builder',
    path: '/tools/prompt-builder',
    description: '画像生成プロンプトのワード帳',
    entry: { name: 'client-prompt-builder', src: 'src/client-prompt-builder.tsx' },
    clientScript: { dev: '/src/client-prompt-builder.tsx', prod: '/assets/client-prompt-builder.js' },
    css: { prod: '/assets/client-prompt-builder.css' },
    nav: [
      { label: 'ワード一覧', to: '/words' },
      { label: '登録', to: '/register' },
      { label: '出力', to: '/output' },
    ],
    inlineStyle: true,
  },
]
