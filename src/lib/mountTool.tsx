import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

// 各ツールのクライアントエントリ（client.tsx 等）に共通の定型。ツールシェルは空 #root を返す
// ため、hydrate ではなく createRoot を使う。
export const mountTool = (app: ReactElement) => {
  createRoot(document.getElementById('root')!).render(app)
}
