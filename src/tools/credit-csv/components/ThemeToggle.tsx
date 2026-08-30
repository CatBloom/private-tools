import type { Theme } from '../hooks/useTheme'

type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
}

export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => (
  <button className="ccsv-theme-toggle" type="button" onClick={onToggle}>
    {theme === 'light' ? 'ダーク' : 'ライト'}
  </button>
)
