import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider } from '../../../components/feedback'
import { getWords, putWords } from '../api'
import type { PromptWord } from '../shared/types'
import { useWords, WordsProvider } from './WordsProvider'

vi.mock('../api', () => ({
  getWords: vi.fn(),
  putWords: vi.fn(),
}))

const sampleWords: PromptWord[] = [
  { id: 'w1', text: 'cat girl', description: 'ネコ耳キャラ', tag: 'illustrator' },
  { id: 'w2', text: 'blue sky', description: '', tag: 'quality' },
]

// addWords/saveWords/自動保存のふるまいをテストするための最小限のコンシューマ。
const Harness = () => {
  const { words, dirty, saveStatus, saveError, saveWords, addWords } = useWords()
  const [text, setText] = useState('')
  const [limitResult, setLimitResult] = useState<string | null>(null)

  return (
    <div>
      <input aria-label="ワード" value={text} onChange={(event) => setText(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          const result = addWords([{ text, description: '', tag: 'expression' }])
          setLimitResult(result.ok ? null : result.reason)
          setText('')
        }}
      >
        追加
      </button>
      <button type="button" onClick={() => saveWords()}>
        保存
      </button>
      <span data-testid="word-count">{words.length}</span>
      {limitResult ? <span data-testid="limit-result">{limitResult}</span> : null}
      <ul>
        {words.map((word) => (
          <li key={word.id}>{word.text}</li>
        ))}
      </ul>
      {dirty && saveStatus !== 'saving' ? <span>未保存の変更あり</span> : null}
      {saveError ? <p role="alert">{saveError}</p> : null}
    </div>
  )
}

const renderHarness = () =>
  render(
    <AlertProvider>
      <WordsProvider>
        <Harness />
      </WordsProvider>
    </AlertProvider>,
  )

describe('WordsProvider', () => {
  beforeEach(() => {
    vi.mocked(getWords).mockResolvedValue(sampleWords)
    vi.mocked(putWords).mockImplementation(async (words) => words)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('addWords appends a trimmed word and marks state dirty', async () => {
    renderHarness()
    await screen.findByText('cat girl')

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: '  new word  ' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('new word')).toBeInTheDocument()
    expect(screen.getByText('未保存の変更あり')).toBeInTheDocument()
  })

  it('addWords rejects a batch that would exceed the word limit, without adding any of it', async () => {
    const nearLimitWords: PromptWord[] = Array.from({ length: 1999 }, (_, index) => ({
      id: `w${index}`,
      text: `word ${index}`,
      description: '',
      tag: 'others',
    }))
    vi.mocked(getWords).mockResolvedValue(nearLimitWords)

    renderHarness()
    await waitFor(() => expect(screen.getByTestId('word-count')).toHaveTextContent('1999'))

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'one more' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(screen.getByText('one more')).toBeInTheDocument()
    expect(screen.getByTestId('word-count')).toHaveTextContent('2000')

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'over limit' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(screen.getByTestId('limit-result')).toHaveTextContent('limit')
    expect(screen.getByTestId('word-count')).toHaveTextContent('2000')
    expect(screen.queryByText('over limit')).not.toBeInTheDocument()
  })

  it('rejects addWords before the initial load completes, and does not lose the server words once it does', async () => {
    let resolveLoad: (words: PromptWord[]) => void = () => {}
    vi.mocked(getWords).mockImplementationOnce(
      () => new Promise<PromptWord[]>((resolve) => { resolveLoad = resolve }),
    )

    renderHarness()

    // ロード完了前に追加すると、直後の GET 結果が「dirty だから」と捨てられ、以後の PUT で
    // KV の既存ワードを全消ししてしまう（P1 の再発防止）。
    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'too early' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(screen.getByTestId('limit-result')).toHaveTextContent('not-ready')
    expect(screen.getByTestId('word-count')).toHaveTextContent('0')
    expect(screen.queryByText('too early')).not.toBeInTheDocument()

    resolveLoad(sampleWords)

    expect(await screen.findByText('cat girl')).toBeInTheDocument()
    expect(screen.getByText('blue sky')).toBeInTheDocument()
    expect(screen.getByTestId('word-count')).toHaveTextContent('2')
    expect(screen.queryByText('too early')).not.toBeInTheDocument()
  })

  describe('word list auto save (debounce)', () => {
    const AUTO_SAVE_DELAY_MS = 30_000

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-saves once after the debounce delay from the last change', async () => {
      renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'auto word' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)

      expect(putWords).toHaveBeenCalledTimes(1)
      const [words] = vi.mocked(putWords).mock.calls[0]
      expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'auto word'])
      expect(await screen.findByText('保存しました')).toBeInTheDocument()
    })

    it('resets the debounce timer while changes keep happening', async () => {
      renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000)
      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1000)
      expect(putWords).toHaveBeenCalledTimes(1)
    })

    it('does not auto-retry after a failed save until the next edit re-arms it', async () => {
      vi.mocked(putWords).mockRejectedValueOnce(new Error('save failed'))

      renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 3)
      expect(putWords).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(2)
    })

    it('does not double-save when a manual save happens before the debounce fires', async () => {
      renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'manual word' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      fireEvent.click(screen.getByRole('button', { name: '保存' }))

      await vi.waitFor(() => expect(putWords).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
    })

    it('keeps edits made while an auto-save is in flight and re-saves them', async () => {
      let resolveSave: (value: PromptWord[]) => void = () => {}
      vi.mocked(putWords).mockImplementationOnce(
        () => new Promise<PromptWord[]>((resolve) => { resolveSave = resolve }),
      )

      renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      resolveSave([])
      await waitFor(() => expect(screen.getByText('second')).toBeInTheDocument())
      expect(screen.getByText('first')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('second')
    })

    it('serializes the unmount flush behind an in-flight save so the newest edit is sent last', async () => {
      let resolveSave: (value: PromptWord[]) => void = () => {}
      vi.mocked(putWords).mockImplementationOnce(
        () => new Promise<PromptWord[]>((resolve) => { resolveSave = resolve }),
      )

      const { unmount } = renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      unmount()

      await Promise.resolve()
      expect(putWords).toHaveBeenCalledTimes(1)

      resolveSave([])
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('second')
    })

    it('does not duplicate the write when navigating during a successful save with no further edit', async () => {
      let resolveSave: (value: PromptWord[]) => void = () => {}
      vi.mocked(putWords).mockImplementationOnce(
        () => new Promise<PromptWord[]>((resolve) => { resolveSave = resolve }),
      )

      const { unmount } = renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'only' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)

      unmount()

      resolveSave([])
      await vi.runAllTimersAsync()
      await Promise.resolve()
      expect(putWords).toHaveBeenCalledTimes(1)
    })

    it('re-sends the pending edit on unmount after a failed save with no further edits', async () => {
      vi.mocked(putWords).mockRejectedValueOnce(new Error('save failed'))

      const { unmount } = renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      unmount()
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('first')
    })

    it('flushes on pagehide with keepalive, updates dirty/lastSent on success, and does not resend after the debounce delay', async () => {
      renderHarness()
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'bg word' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      // pagehide はページが実際には破棄されない（バックグラウンド化・bfcache）こともあるため、
      // ここではアンマウントせずイベントだけ発火してコンポーネントが生き続けるケースを再現する。
      window.dispatchEvent(new Event('pagehide'))
      await vi.advanceTimersByTimeAsync(0)

      expect(putWords).toHaveBeenCalledTimes(1)
      const [words, options] = vi.mocked(putWords).mock.calls[0]
      expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'bg word'])
      expect(options).toEqual({ keepalive: true })

      // flush 成功時に dirty/lastSent が更新されるので、未保存バッジが消える。
      await waitFor(() => expect(screen.queryByText('未保存の変更あり')).not.toBeInTheDocument())

      // 30 秒経っても、flush 済みの内容を再送しない。
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
    })
  })
})
