import { readJson, THEME_STORAGE_KEY, writeJson } from '../lib/storage'
import { themeToggleLabel } from '../lib/theme-labels'

export const THEME_KEY = THEME_STORAGE_KEY

type Theme = 'light' | 'dark'

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

// 共通フック src/hooks/usePersistedState.ts と同じ JSON 形式で読み書きし、テーマ状態を共有する
const readStoredTheme = (): Theme | null => {
  const stored = readJson<unknown>(THEME_KEY, null)
  return isTheme(stored) ? stored : null
}

const prefersDark = (): boolean => {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

const effectiveTheme = (): Theme => readStoredTheme() ?? (prefersDark() ? 'dark' : 'light')

const applyTheme = (theme: Theme | null) => {
  if (theme) document.documentElement.dataset.theme = theme
}

const updateToggleLabels = (theme: Theme) => {
  const label = themeToggleLabel(theme)
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', label)
    button.title = label
  })
}

const handleToggleClick = () => {
  const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  writeJson(THEME_KEY, next)
  updateToggleLabels(next)
}

applyTheme(readStoredTheme())
updateToggleLabels(effectiveTheme())
document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((button) => {
  button.addEventListener('click', handleToggleClick)
})
