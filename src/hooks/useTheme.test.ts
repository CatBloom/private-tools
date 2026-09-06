import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '../lib/storage'
import { useTheme } from './useTheme'

afterEach(() => {
  localStorage.clear()
})

describe('useTheme', () => {
  it('defaults to light when nothing is stored', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
  })

  it('initializes from a persisted theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify('dark'))

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('dark')
  })

  it('toggles between light and dark and persists the change', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify('dark'))

    act(() => {
      result.current.toggle()
    })
    expect(result.current.theme).toBe('light')
  })
})
