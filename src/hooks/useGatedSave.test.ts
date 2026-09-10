import { act, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGatedSave } from './useGatedSave'

// 実際の TodoContext/LedgerContext と同じ流れ（読み込み完了時に markSynced してから ready にする）
// を再現するハーネス。ready の初期値は false にし、mount 直後の空撃ち保存を防ぐ。
const useHarness = (initial: number, save: (state: number) => Promise<unknown>, onError?: (message: string) => void) => {
  const [state, setState] = useState(initial)
  const [ready, setReady] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const gated = useGatedSave({ state, stateRef, ready, save, onError })
  return { state, setState, ready, setReady, ...gated }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useGatedSave', () => {
  it('saves immediately when no recent write has happened', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useHarness(0, save))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    await act(async () => {})

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(1)
    expect(result.current.saveStatus).toBe('saved')
  })

  it('coalesces changes made within minIntervalMs into a single save of the latest value', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useHarness(0, save))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    await act(async () => {})
    expect(save).toHaveBeenCalledTimes(1)

    act(() => result.current.setState(2))
    act(() => result.current.setState(3))
    // 直前の書き込みから1秒未満なのでまだ送信されない
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(3)
  })

  it('resends exactly once after an in-flight save resolves if state changed meanwhile', async () => {
    vi.useFakeTimers()
    let resolveFirst!: () => void
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useHarness(0, save))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('saving')

    act(() => result.current.setState(2))
    // 1回目が in-flight の間は送られない
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst()
    })
    // 完了直後は1秒ゲートにより即時ではなく遅延される
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2)
    expect(result.current.saveStatus).toBe('saved')
  })

  it('does not retry automatically after a failure; the next change re-arms it', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const { result } = renderHook(() => useHarness(0, save, onError))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    await act(async () => {})

    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('error')
    expect(result.current.saveError).toBe('boom')
    expect(onError).toHaveBeenCalledWith('boom')

    act(() => result.current.setState(2))
    // 1秒ゲート中は自動では送られない（失敗後の自動リトライも無い）
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2)
    expect(result.current.saveStatus).toBe('saved')
  })

  it('clears the pending save timer on unmount', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() => useHarness(0, save))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    await act(async () => {})
    expect(save).toHaveBeenCalledTimes(1)

    act(() => result.current.setState(2))
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('hasPendingChanges reflects unsaved edits and markSynced clears them', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useHarness(0, save))

    expect(result.current.hasPendingChanges()).toBe(true)
    act(() => result.current.markSynced(0))
    expect(result.current.hasPendingChanges()).toBe(false)
  })
})
