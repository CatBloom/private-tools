import type { Theme } from '../hooks/useTheme'
import { themeToggleLabel } from '../lib/theme-labels'
import { DarkModeIcon, LightModeIcon } from './icons'

type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
}

export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => {
  const label = themeToggleLabel(theme)
  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label={label} title={label}>
      {theme === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
    </button>
  )
}
