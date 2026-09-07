import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoSave, type UseAutoSaveOptions } from './useAutoSave'

const DELAY_MS = 30_000

const renderAutoSave = (overrides: Partial<UseAutoSaveOptions<string[]>> = {}) => {
  let value: string[] = []
  let dirty = false
  // save/onSaved は options オブジェクトを介して useCallback の依存に入るため、テストごとに
  // 一度だけ作る（render のたびに新しい関数を渡すと flush effect が再セットアップされてしまう）。
  const defaults = { save: vi.fn(async () => {}), onSaved: vi.fn(), ...overrides }

  const { result, rerender, unmount } = renderHook(
    (props: { value: string[]; dirty: boolean }) =>
      useAutoSave<string[]>({
        value: props.value,
        dirty: props.dirty,
        delayMs: DELAY_MS,
        ...defaults,
      }),
    { initialProps: { value, dirty } },
  )

  const edit = (item: string) => {
    value = [...value, item]
    dirty = true
    rerender({ value, dirty })
  }

  return { result, edit, unmount }
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves once after the debounce delay from the last edit', async () => {
    const save = vi.fn(async () => {})
    const onSaved = vi.fn()
    const { edit } = renderAutoSave({ save, onSaved })

    edit('a')
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(['a'], {})
    expect(onSaved).toHaveBeenCalledWith(['a'])
  })

  it('resets the debounce timer while edits keep happening', async () => {
    const save = vi.fn(async () => {})
    const { edit } = renderAutoSave({ save })

    edit('a')
    await vi.advanceTimersByTimeAsync(DELAY_MS - 1000)

    edit('b')
    await vi.advanceTimersByTimeAsync(DELAY_MS - 1000)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not auto-retry after a failed save until resetStatus re-arms it', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('save failed')).mockResolvedValue(undefined)
    const { result, edit } = renderAutoSave({ save })

    edit('a')
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.status).toBe('error'))

    await vi.advanceTimersByTimeAsync(DELAY_MS * 3)
    expect(save).toHaveBeenCalledTimes(1)

    act(() => result.current.resetStatus())
    edit('b')
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('keeps edits made while a save is in flight and re-sends them once it resolves', async () => {
    let resolveSave: () => void = () => {}
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve }))
      .mockResolvedValue(undefined)
    const { edit } = renderAutoSave({ save })

    edit('a')
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)

    edit('b')
    resolveSave()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(['a', 'b'], {})
  })

  it('flushes once on unmount when dirty, with keepalive', async () => {
    const save = vi.fn(async () => {})
    const { edit, unmount } = renderAutoSave({ save })

    edit('a')
    unmount()

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith(['a'], { keepalive: true })
  })

  it('flushes on pagehide with keepalive, and does not resend after the debounce delay once it succeeds', async () => {
    const save = vi.fn(async () => {})
    const onSaved = vi.fn()
    const { edit } = renderAutoSave({ save, onSaved })

    edit('a')
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(['a'], { keepalive: true })
    expect(onSaved).toHaveBeenCalledWith(['a'])

    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not flush or reset the debounce timer when save/onSaved are new functions on every render', async () => {
    const calls: Array<[string[], { keepalive?: boolean }]> = []
    const trackedSave = async (snapshot: string[], options: { keepalive?: boolean }) => {
      calls.push([snapshot, options])
    }

    const { rerender } = renderHook(
      (props: { value: string[]; dirty: boolean }) =>
        useAutoSave<string[]>({
          value: props.value,
          dirty: props.dirty,
          delayMs: DELAY_MS,
          save: (snapshot, options) => trackedSave(snapshot, options),
          onSaved: () => {},
        }),
      { initialProps: { value: ['a'], dirty: true } },
    )

    // 呼び出し側が毎レンダー新しい save/onSaved を渡す状況を再現する（値・dirty は変えない）。
    rerender({ value: ['a'], dirty: true })
    rerender({ value: ['a'], dirty: true })
    expect(calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(DELAY_MS - 1)
    expect(calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(1)
  })
})
