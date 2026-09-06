import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePersistedState } from './usePersistedState'

afterEach(() => {
  localStorage.clear()
})

describe('usePersistedState', () => {
  it('initializes from an existing localStorage value', () => {
    localStorage.setItem('test:key', JSON.stringify('stored'))

    const { result } = renderHook(() => usePersistedState('test:key', 'fallback'))

    expect(result.current[0]).toBe('stored')
  })

  it('falls back to the initial value when nothing is stored', () => {
    const { result } = renderHook(() => usePersistedState('test:missing', 'fallback'))

    expect(result.current[0]).toBe('fallback')
  })

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => usePersistedState('test:key', 'fallback'))

    act(() => {
      result.current[1]('updated')
    })

    expect(result.current[0]).toBe('updated')
    expect(localStorage.getItem('test:key')).toBe(JSON.stringify('updated'))
  })
})
