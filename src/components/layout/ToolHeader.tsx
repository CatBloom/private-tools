import type { ReactNode } from 'react'

// サイドバー無しツールの共通トップバー。左上に「ツール一覧」への導線とタイトルを縦に並べ、
// 右側は各ツール固有の操作（テーマ切替など）を children で受け取る。スタイルは
// src/public/styles.css の `.tool-header-*` に置く（feedback の `.fbk-*` と同じ理由で、
// ツール別バンドルの CSS だとシェルが link せず本番で無スタイル化するため）。
type ToolHeaderProps = {
  title: string
  children?: ReactNode
}

export const ToolHeader = ({ title, children }: ToolHeaderProps) => (
  <header className="tool-header">
    <div className="tool-header-titlebar">
      <a className="tool-header-back-link" href="/">
        ← ツール一覧
      </a>
      <span className="tool-header-title">{title}</span>
    </div>
    <div className="tool-header-actions">{children}</div>
  </header>
)
