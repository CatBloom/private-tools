import { beforeEach, describe, expect, it, vi } from 'vitest'

const THEME_KEY = 'private-tools:theme'

const loadTheme = async () => {
  vi.resetModules()
  return import('./theme')
}

describe('theme toggle script', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.body.innerHTML =
      '<button data-theme-toggle aria-label="ダークモードに切り替え" title="ダークモードに切り替え"></button>'
    localStorage.clear()
  })

  it('toggles document theme and localStorage on click, updating the toggle aria-label', async () => {
    await loadTheme()
    const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!

    button.click()
    expect(document.documentElement.dataset.theme).toBe('dark')
    // usePersistedState と同じ JSON 形式で保存し、ツールとテーマ状態を共有する
    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('dark'))
    expect(button.getAttribute('aria-label')).toBe('ライトモードに切り替え')
    expect(button.title).toBe('ライトモードに切り替え')

    button.click()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('light'))
    expect(button.getAttribute('aria-label')).toBe('ダークモードに切り替え')
    expect(button.title).toBe('ダークモードに切り替え')
  })

  it('applies a previously stored theme on load', async () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('dark'))
    await loadTheme()

    expect(document.documentElement.dataset.theme).toBe('dark')
    const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!
    expect(button.getAttribute('aria-label')).toBe('ライトモードに切り替え')
  })
})
