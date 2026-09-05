import type { Theme } from '../hooks/useTheme'

// 3ツール共通のテーマ切替ボタン。配置ごとの位置調整（credit-csv のサイドバー内など）は
// 各ツールの CSS 側で `.theme-toggle` にスコープしたセレクタを足す（スタイルは
// src/public/styles.css の `.theme-toggle`。理由は ToolLayout と同じ）。
type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
}

export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => (
  <button className="theme-toggle" type="button" onClick={onToggle}>
    {theme === 'light' ? 'ダーク' : 'ライト'}
  </button>
)
