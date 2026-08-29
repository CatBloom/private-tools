import { beforeEach, describe, expect, it, vi } from 'vitest'

const THEME_KEY = 'private-tools:theme'

const loadTheme = async () => {
  vi.resetModules()
  return import('./theme')
}

describe('theme toggle script', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.body.innerHTML = '<button data-theme-toggle aria-label="テーマ切替">ダーク</button>'
    localStorage.clear()
  })

  it('toggles document theme and localStorage on click, updating the toggle label', async () => {
    await loadTheme()
    const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!

    button.click()
    expect(document.documentElement.dataset.theme).toBe('dark')
    // usePersistedState と同じ JSON 形式で保存し、ツールとテーマ状態を共有する
    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('dark'))
    expect(button.textContent).toBe('ライト')

    button.click()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('light'))
    expect(button.textContent).toBe('ダーク')
  })

  it('applies a previously stored theme on load', async () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('dark'))
    await loadTheme()

    expect(document.documentElement.dataset.theme).toBe('dark')
    const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!
    expect(button.textContent).toBe('ライト')
  })
})
