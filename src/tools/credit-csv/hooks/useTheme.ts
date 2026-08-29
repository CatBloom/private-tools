import { useCallback } from 'react'
import { usePersistedState } from './usePersistedState'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'private-tools:theme'

export const useTheme = () => {
  const [theme, setTheme] = usePersistedState<Theme>(THEME_STORAGE_KEY, 'light')

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }, [setTheme])

  return { theme, toggle }
}
