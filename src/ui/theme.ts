export const THEME_KEY = 'private-tools:theme'

type Theme = 'light' | 'dark'

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

// credit-csv ツールの usePersistedState と同じ JSON 形式で読み書きし、テーマ状態を共有する
const readStoredTheme = (): Theme | null => {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isTheme(parsed) ? parsed : null
  } catch {
    return null
  }
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

const toggleLabel = (theme: Theme): string => (theme === 'dark' ? 'ライト' : 'ダーク')

const updateToggleLabels = (theme: Theme) => {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((button) => {
    button.textContent = toggleLabel(theme)
  })
}

const handleToggleClick = () => {
  const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(next))
  } catch {
    // localStorage が使えない環境（プライベートモード等）では保存をあきらめる
  }
  updateToggleLabels(next)
}

applyTheme(readStoredTheme())
updateToggleLabels(effectiveTheme())
document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((button) => {
  button.addEventListener('click', handleToggleClick)
})
