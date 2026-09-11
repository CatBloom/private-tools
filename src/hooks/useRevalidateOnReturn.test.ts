import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRevalidateOnReturn } from './useRevalidateOnReturn'

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

const fireVisibilityChange = () => document.dispatchEvent(new Event('visibilitychange'))
const fireFocus = () => window.dispatchEvent(new Event('focus'))

afterEach(() => {
  setVisibility('visible')
  vi.useRealTimers()
})

describe('useRevalidateOnReturn', () => {
  it('calls back when the tab becomes visible', () => {
    const callback = vi.fn()
    renderHook(() => useRevalidateOnReturn(callback))

    setVisibility('visible')
    act(() => fireVisibilityChange())

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not call back when visibilitychange fires while hidden', () => {
    const callback = vi.fn()
    renderHook(() => useRevalidateOnReturn(callback))

    setVisibility('hidden')
    act(() => fireVisibilityChange())

    expect(callback).not.toHaveBeenCalled()
  })

  it('calls back on window focus', () => {
    const callback = vi.fn()
    renderHook(() => useRevalidateOnReturn(callback))

    act(() => fireFocus())

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('ignores a duplicate trigger within minIntervalMs (visibilitychange and focus firing together)', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    renderHook(() => useRevalidateOnReturn(callback, { minIntervalMs: 1000 }))

    act(() => {
      fireVisibilityChange()
      fireFocus()
    })
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(999))
    act(() => fireFocus())
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(1))
    act(() => fireFocus())
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('always uses the latest callback without re-subscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useRevalidateOnReturn(cb), { initialProps: { cb: first } })

    rerender({ cb: second })
    act(() => fireFocus())

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops calling back after unmount', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useRevalidateOnReturn(callback))

    unmount()
    act(() => fireFocus())

    expect(callback).not.toHaveBeenCalled()
  })
})
