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

  it('flushes a pending gated change immediately (with keepalive) on unmount instead of losing it', async () => {
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
    // まだ1秒ゲート中（pendingTimer 待ち）でアンマウントする。
    unmount()

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2, { keepalive: true })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    // flush 済みなので、消したはずのゲートタイマーから重複送信されない。
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flushes a pending gated change immediately (with keepalive) on pagehide', async () => {
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
    // まだ1秒ゲート中（pendingTimer 待ち）
    expect(save).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2, { keepalive: true })

    await act(async () => {})
    expect(result.current.saveStatus).toBe('saved')
  })

  it('sends the flushed keepalive save only once even when pagehide and unmount both flush while a save is in-flight', async () => {
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
      .mockResolvedValue(undefined)

    const { result, unmount } = renderHook(() => useHarness(0, save))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('saving')

    act(() => result.current.setState(2))
    // 1回目がまだ in-flight の間に pagehide → 続けてアンマウント、と flush が重なる。
    // どちらも同じ in-flight の完了を待ってから送ろうとするため、二重送信になり得る箇所。
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    unmount()

    await act(async () => {
      resolveFirst()
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2, { keepalive: true })
  })

  it('clears a pending-timer created while waiting for an in-flight save before sending the pagehide flush, so a failed keepalive does not trigger an extra retry PUT', async () => {
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
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined)

    const { result } = renderHook(() => useHarness(0, save))

    act(() => {
      result.current.markSynced(0)
      result.current.setReady(true)
    })
    act(() => result.current.setState(1))
    expect(save).toHaveBeenCalledTimes(1)

    act(() => result.current.setState(2))
    // 1回目がまだ in-flight の間に pagehide が発火する（flush は完了を待つ）。
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(save).toHaveBeenCalledTimes(1)

    // 1回目が完了する。完了処理（stateRef との差分を見た再送）が pendingTimer を作るが、
    // flush の send はそれより後に走るため、送る前にそのタイマーを消す。
    await act(async () => {
      resolveFirst()
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2, { keepalive: true })

    // keepalive 送信（2回目）が失敗しても、消えているはずのタイマーから通常 PUT の
    // 再送は起きない（自動リトライしない契約）。
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('hasPendingChanges reflects unsaved edits and markSynced clears them', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useHarness(0, save))

    expect(result.current.hasPendingChanges()).toBe(true)
    act(() => result.current.markSynced(0))
    expect(result.current.hasPendingChanges()).toBe(false)
  })
})
