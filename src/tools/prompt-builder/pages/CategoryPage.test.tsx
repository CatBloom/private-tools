import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { CategoryPage } from './CategoryPage'
import { getHistory, getWords, putHistory, putWords } from '../api'
import type { HistoryEntry, PromptWord } from '../shared/types'

// CategoryPage は useAlert/useConfirm を使うため、常に Provider でラップして render する。
const renderPage = () =>
  render(
    <AlertProvider>
      <ConfirmProvider>
        <CategoryPage category="base-prompt" />
      </ConfirmProvider>
    </AlertProvider>,
  )

// ワード一覧はタグフィルタで「ALL」を選ぶまで非表示なので、一覧を操作するテストは
// まずこれで全件表示にしてから進める（読み込み完了の待ち合わせも兼ねる）。
const showAllWords = async () => {
  const filterSelect = await screen.findByLabelText('タグで絞り込み')
  fireEvent.change(filterSelect, { target: { value: 'ALL' } })
  return screen.findByText('cat girl')
}

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
  { id: 'w1', text: 'cat girl', description: 'ネコ耳キャラ', tag: 'illustrator' },
  { id: 'w2', text: 'blue sky', description: '', tag: 'quality' },
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
    renderPage()

    await screen.findByLabelText('タグで絞り込み')
    expect(screen.getByRole('tab', { name: 'ワード' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('出力欄')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))

    expect(screen.getByRole('tab', { name: /^出力/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('出力欄')).toBeInTheDocument()
    expect(screen.queryByText('ワード一覧')).not.toBeInTheDocument()
  })

  it('hides the word list until a tag is selected, then filters by ALL or a specific tag', async () => {
    renderPage()

    const filterSelect = await screen.findByLabelText('タグで絞り込み')
    expect(screen.getByText('タグを選択してください。')).toBeInTheDocument()
    expect(screen.queryByText('cat girl')).not.toBeInTheDocument()

    fireEvent.change(filterSelect, { target: { value: 'ALL' } })
    expect(await screen.findByText('cat girl')).toBeInTheDocument()
    expect(screen.getByText('blue sky')).toBeInTheDocument()

    fireEvent.change(filterSelect, { target: { value: 'illustrator' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    expect(screen.queryByText('blue sky')).not.toBeInTheDocument()
  })

  it('groups words by tag with headings in the fixed order when ALL is selected, and has no reorder controls', async () => {
    renderPage()
    await showAllWords()

    // 固定順は angle, composition, expression, illustrator, pose, quality, situation, others。
    // 0件のタグは見出しごと出さないので、sampleWords に存在する illustrator/quality のみ表示される。
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'illustrator',
      'quality',
    ])
    expect(screen.queryByRole('button', { name: '上へ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下へ' })).not.toBeInTheDocument()

    const illustratorGroup = screen.getByRole('heading', { name: 'illustrator' }).closest('.pbuilder-tag-group')!
    expect(within(illustratorGroup as HTMLElement).getByText('cat girl')).toBeInTheDocument()

    const qualityGroup = screen.getByRole('heading', { name: 'quality' }).closest('.pbuilder-tag-group')!
    expect(within(qualityGroup as HTMLElement).getByText('blue sky')).toBeInTheDocument()
  })

  it('loads words and adds a selected word to the output preview', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))

    expect(await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('reflects weight changes in the output preview', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: '強める' }))

    expect(await screen.findByText('{cat girl}', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('disables adding words until the initial load completes', async () => {
    // 初回 getWords を保留させ、ロード中の状態を作る
    let resolveLoad: (words: PromptWord[]) => void = () => {}
    vi.mocked(getWords).mockImplementationOnce(() => new Promise<PromptWord[]>((resolve) => { resolveLoad = resolve }))

    renderPage()

    // ロード中は入力・追加を無効化（未取得の一覧への追加→保存で既存を消すのを防ぐ）
    expect(screen.getByLabelText('ワード')).toBeDisabled()
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()

    resolveLoad(sampleWords)
    await screen.findByLabelText('タグで絞り込み')
    expect(screen.getByLabelText('ワード')).toBeEnabled()
  })

  it('requires a tag to be selected before adding a word', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'no tag word' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    // 「タグを選択してください」は未選択オプション（プレースホルダ）のラベルとも重複するため、
    // トーストのメッセージ要素に絞って探す。
    expect(await screen.findByText('タグを選択してください', { selector: '.fbk-alert-message' })).toBeInTheDocument()
    expect(screen.queryByText('no tag word')).not.toBeInTheDocument()
    expect(putWords).not.toHaveBeenCalled()
  })

  it('saves the current word list via putWords', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'new word' } })
    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    const saveButton = await screen.findByRole('button', { name: '保存' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(putWords).toHaveBeenCalledTimes(1))
    const [category, words] = vi.mocked(putWords).mock.calls[0]
    expect(category).toBe('base-prompt')
    expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'new word'])
    expect(words.map((word) => word.tag)).toEqual(['illustrator', 'quality', 'pose'])
    // 手動保存は成功トーストを出す
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
  })

  it('copies the output preview text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cat girl'))
    // コピー成功をトーストで通知する
    expect(await screen.findByText('コピーしました')).toBeInTheDocument()
  })

  it('saves the current output as a named history entry via putHistory', async () => {
    renderPage()
    await showAllWords()

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
    renderPage()

    await screen.findByLabelText('タグで絞り込み')
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

    renderPage()

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

    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('set one', { exact: false })

    const firstDelete = screen.getAllByRole('button', { name: '削除' })[0]
    fireEvent.click(firstDelete)
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    // While the PUT is pending, every delete/rename-start button is disabled so a second
    // click cannot race on a stale history array.
    await waitFor(() => {
      screen.getAllByRole('button', { name: '削除' }).forEach((button) => expect(button).toBeDisabled())
      screen.getAllByRole('button', { name: '編集' }).forEach((button) => expect(button).toBeDisabled())
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

    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledWith('base-prompt', []))
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
  })

  it('does not delete the history entry when the confirmation is cancelled', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(putHistory).not.toHaveBeenCalled()
    expect(screen.getByText('saved set', { exact: false })).toBeInTheDocument()
  })

  it("renames a history entry's name via putHistory, keeping its items intact", async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    const nameInput = screen.getAllByLabelText('履歴名').find((el) => (el as HTMLInputElement).value === 'saved set')!
    fireEvent.change(nameInput, { target: { value: 'renamed set' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledTimes(1))
    expect(putHistory).toHaveBeenCalledWith('base-prompt', [{ ...entry, name: 'renamed set' }])
    expect(await screen.findByText('renamed set', { exact: false })).toBeInTheDocument()
    expect(await screen.findByText('名前を変更しました')).toBeInTheDocument()
  })

  it('does not change the history entry name when the rename is cancelled', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    const nameInput = screen.getAllByLabelText('履歴名').find((el) => (el as HTMLInputElement).value === 'saved set')!
    fireEvent.change(nameInput, { target: { value: 'renamed set' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(putHistory).not.toHaveBeenCalled()
    expect(screen.getByText('saved set', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('renamed set', { exact: false })).not.toBeInTheDocument()
  })

  it('deletes a word after confirmation and shows a success toast', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(screen.queryByText('cat girl')).not.toBeInTheDocument())
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
  })

  it('does not delete a word when the delete confirmation is cancelled', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(screen.getByText('cat girl')).toBeInTheDocument()
  })

  it('shows a success toast after adding a word', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'new word' } })
    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('追加しました')).toBeInTheDocument()
  })

  it('shows an info toast and does not add a duplicate when the same word is added to the output twice', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    const addButton = within(wordRow).getByRole('button', { name: '出力に追加' })

    fireEvent.click(addButton)
    expect(await screen.findByText('出力に追加しました')).toBeInTheDocument()

    fireEvent.click(addButton)
    expect(await screen.findByText('既に追加されています')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^出力/ }))
    expect(screen.getAllByText('cat girl', { selector: '.pbuilder-output-item-preview' })).toHaveLength(1)
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
      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'auto word' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)

      expect(putWords).toHaveBeenCalledTimes(1)
      const [category, words] = vi.mocked(putWords).mock.calls[0]
      expect(category).toBe('base-prompt')
      expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'auto word'])
      // 自動保存でも成功トーストを出す
      expect(screen.getByText('保存しました')).toBeInTheDocument()
    })

    it('resets the debounce timer while changes keep happening', async () => {
      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      // 1回目の変更からアイドルが完了する直前
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      // 2回目の変更でタイマーがリセットされるので、そこからアイドル完了までは発火しない
      // （1回目の変更からは十分に時間が経っていても）
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000)
      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1000)
      expect(putWords).toHaveBeenCalledTimes(1)
    })

    it('does not auto-retry after a failed save until the next edit re-arms it', async () => {
      vi.mocked(putWords).mockRejectedValueOnce(new Error('save failed'))

      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      // エラー後はデバウンスのたびに再送し続けない（KV 書き込みクォータを浪費しない）
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 3)
      expect(putWords).toHaveBeenCalledTimes(1)

      // 次のワード編集で自動保存が再アームされる
      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(2)
    })

    it('does not double-save when a manual save happens before the debounce fires', async () => {
      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'manual word' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
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

      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1) // 通信中（未解決）

      // 保存の通信中にユーザーが別のワードを追加する
      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
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
