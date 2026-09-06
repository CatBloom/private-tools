export type Theme = 'light' | 'dark'

export const themeToggleLabel = (theme: Theme): string =>
  theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'
