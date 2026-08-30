export const THEME_STORAGE_KEY = 'private-tools:theme'

export const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage が使えない環境（プライベートモード等）では保存をあきらめる
  }
}
