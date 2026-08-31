import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CategoryPage } from './CategoryPage'
import { getHistory, getWords, putHistory, putWords } from '../api'
import type { HistoryEntry, PromptWord } from '../shared/types'

vi.mock('../api', () => ({
  getWords: vi.fn(),
  putWords: vi.fn(),
  getHistory: vi.fn(),
  putHistory: vi.fn(),
}))

// jsdom はドラッグ操作を再現できないため、@dnd-kit はレンダリングだけ通す最小モックにする
// （並べ替えの結線は notation.test.ts の reorder で検証し、ここでは選択・強調・保存・
//   コピーなど周辺ロジックの結線だけを見る）。
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: class {},
  TouchSensor: class {},
  KeyboardSensor: class {},
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: 'vertical',
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

const sampleWords: PromptWord[] = [
  { id: 'w1', text: 'cat girl', description: 'ネコ耳キャラ' },
  { id: 'w2', text: 'blue sky', description: '' },
]

describe('CategoryPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getWords).mockResolvedValue(sampleWords)
    vi.mocked(putWords).mockImplementation(async (_category, words) => words)
    vi.mocked(getHistory).mockResolvedValue([])
    vi.mocked(putHistory).mockImplementation(async (_category, entries) => entries)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('switches between the words tab and the output tab', async () => {
    render(<CategoryPage category="base-prompt" />)

    await screen.findByText('cat girl')
    expect(screen.getByRole('tab', { name: 'ワード' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('出力欄')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))

    expect(screen.getByRole('tab', { name: /^出力/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('出力欄')).toBeInTheDocument()
    expect(screen.queryByText('ワード一覧')).not.toBeInTheDocument()
  })

  it('loads words and adds a selected word to the output preview', async () => {
    render(<CategoryPage category="base-prompt" />)

    expect(await screen.findByText('cat girl')).toBeInTheDocument()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))

    expect(await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('reflects weight changes in the output preview', async () => {
    render(<CategoryPage category="base-prompt" />)

    await screen.findByText('cat girl')
    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: '強める' }))

    expect(await screen.findByText('{cat girl}', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('saves the current word list via putWords', async () => {
    render(<CategoryPage category="base-prompt" />)

    await screen.findByText('cat girl')
    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'new word' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    const saveButton = await screen.findByRole('button', { name: '保存' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(putWords).toHaveBeenCalledTimes(1))
    const [category, words] = vi.mocked(putWords).mock.calls[0]
    expect(category).toBe('base-prompt')
    expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'new word'])
  })

  it('copies the output preview text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<CategoryPage category="base-prompt" />)

    await screen.findByText('cat girl')
    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cat girl'))
  })

  it('saves the current output as a named history entry via putHistory', async () => {
    render(<CategoryPage category="base-prompt" />)

    await screen.findByText('cat girl')
    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.change(screen.getByLabelText('履歴名'), { target: { value: 'お気に入り' } })
    fireEvent.click(screen.getByRole('button', { name: '履歴に保存' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledTimes(1))
    const [category, entries] = vi.mocked(putHistory).mock.calls[0]
    expect(category).toBe('base-prompt')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('お気に入り')
    expect(entries[0].items.map((item) => item.text)).toEqual(['cat girl'])
  })

  it('disables saving history when the output is empty', async () => {
    render(<CategoryPage category="base-prompt" />)

    await screen.findByText('cat girl')
    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))

    expect(await screen.findByRole('button', { name: '履歴に保存' })).toBeDisabled()
  })

  it('restores a history entry into the current output', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    render(<CategoryPage category="base-prompt" />)

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    expect(await screen.findByText('saved set', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '復元' }))

    expect(await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('disables history delete buttons while a delete is in flight (prevents lost updates)', async () => {
    const entries: HistoryEntry[] = [
      { id: 'h1', name: 'set one', createdAt: '2024-01-01T00:00:00.000Z', items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }] },
      { id: 'h2', name: 'set two', createdAt: '2024-01-02T00:00:00.000Z', items: [{ id: 'i2', wordId: 'w2', text: 'blue sky', weight: 0 }] },
    ]
    vi.mocked(getHistory).mockResolvedValue(entries)
    let resolvePut: (value: HistoryEntry[]) => void = () => {}
    vi.mocked(putHistory).mockImplementation(() => new Promise<HistoryEntry[]>((resolve) => { resolvePut = resolve }))

    render(<CategoryPage category="base-prompt" />)
    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('set one', { exact: false })

    const firstDelete = screen.getAllByRole('button', { name: '削除' })[0]
    fireEvent.click(firstDelete)

    // While the PUT is pending, every delete button is disabled so a second click
    // cannot race on a stale history array.
    await waitFor(() => {
      screen.getAllByRole('button', { name: '削除' }).forEach((button) => expect(button).toBeDisabled())
    })

    resolvePut(entries.filter((entry) => entry.id !== 'h1'))
    await waitFor(() => expect(screen.queryByText('set one', { exact: false })).not.toBeInTheDocument())
  })

  it('deletes a history entry via putHistory with it excluded', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    render(<CategoryPage category="base-prompt" />)

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledWith('base-prompt', []))
  })

  describe('word list auto save (debounce)', () => {
    const AUTO_SAVE_DELAY_MS = 10_000

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-saves once, 10 seconds after the last change', async () => {
      render(<CategoryPage category="base-prompt" />)
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'auto word' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)

      expect(putWords).toHaveBeenCalledTimes(1)
      const [category, words] = vi.mocked(putWords).mock.calls[0]
      expect(category).toBe('base-prompt')
      expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'auto word'])
      await screen.findByText('保存しました。')
    })

    it('resets the debounce timer while changes keep happening', async () => {
      render(<CategoryPage category="base-prompt" />)
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(5000)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      // 2回目の変更から10秒経つまでは発火しない（1回目の変更からは10秒経過済みでも）
      await vi.advanceTimersByTimeAsync(5000)
      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(5000)
      expect(putWords).toHaveBeenCalledTimes(1)
    })

    it('does not auto-retry after a failed save until the next edit re-arms it', async () => {
      vi.mocked(putWords).mockRejectedValueOnce(new Error('save failed'))

      render(<CategoryPage category="base-prompt" />)
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      // エラー後は10秒ごとに再送し続けない（KV 書き込みクォータを浪費しない）
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 3)
      expect(putWords).toHaveBeenCalledTimes(1)

      // 次のワード編集で自動保存が再アームされる
      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(2)
    })

    it('does not double-save when a manual save happens before the debounce fires', async () => {
      render(<CategoryPage category="base-prompt" />)
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'manual word' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      const saveButton = await screen.findByRole('button', { name: '保存' })
      fireEvent.click(saveButton)

      await vi.waitFor(() => expect(putWords).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
    })

    it('keeps edits made while an auto-save is in flight and re-saves them', async () => {
      let resolveSave: (value: PromptWord[]) => void = () => {}
      vi.mocked(putWords).mockImplementationOnce(
        () => new Promise<PromptWord[]>((resolve) => { resolveSave = resolve }),
      )

      render(<CategoryPage category="base-prompt" />)
      await screen.findByText('cat girl')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1) // 通信中（未解決）

      // 保存の通信中にユーザーが別のワードを追加する
      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      // 古いスナップショットの結果（空配列）を返しても、通信中に足した 'second' は消えない
      resolveSave([])
      await waitFor(() => expect(screen.getByText('second')).toBeInTheDocument())
      expect(screen.getByText('first')).toBeInTheDocument()

      // 新しい状態が次の debounce で再保存される（'second' を含む）
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][1].map((word) => word.text)).toContain('second')
    })
  })
})
