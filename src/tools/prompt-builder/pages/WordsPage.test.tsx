import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { WordsPage } from './WordsPage'
import { getWords, putWords } from '../api'
import { readOutputItems } from '../lib/outputStorage'
import type { PromptWord } from '../shared/types'

const renderPage = () =>
  render(
    <AlertProvider>
      <ConfirmProvider>
        <WordsPage />
      </ConfirmProvider>
    </AlertProvider>,
  )

const showAllWords = async () => {
  await screen.findByLabelText('タグで絞り込み')
  return screen.findByText('cat girl')
}

const openRowMenu = (row: HTMLElement) => fireEvent.click(within(row).getByRole('button', { name: '操作メニュー' }))

vi.mock('../api', () => ({
  getWords: vi.fn(),
  putWords: vi.fn(),
}))

const sampleWords: PromptWord[] = [
  { id: 'w1', text: 'cat girl', description: 'ネコ耳キャラ', tag: 'illustrator' },
  { id: 'w2', text: 'blue sky', description: '', tag: 'quality' },
]

describe('WordsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getWords).mockResolvedValue(sampleWords)
    vi.mocked(putWords).mockImplementation(async (words) => words)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows all words grouped by tag by default, then filters by a specific tag or back to ALL', async () => {
    renderPage()

    const filterSelect = await screen.findByLabelText('タグで絞り込み')
    expect(filterSelect).toHaveValue('ALL')
    expect(await screen.findByText('cat girl')).toBeInTheDocument()
    expect(screen.getByText('blue sky')).toBeInTheDocument()

    fireEvent.change(filterSelect, { target: { value: 'illustrator' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    expect(screen.queryByText('blue sky')).not.toBeInTheDocument()

    fireEvent.change(filterSelect, { target: { value: 'ALL' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    expect(screen.getByText('blue sky')).toBeInTheDocument()
  })

  it('filters words by name or description (case-insensitive partial match), combined with tag filter as AND', async () => {
    renderPage()
    await showAllWords()

    const searchInput = screen.getByLabelText('名前・説明で検索')

    fireEvent.change(searchInput, { target: { value: 'CAT' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    expect(screen.queryByText('blue sky')).not.toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'ネコ耳' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    expect(screen.queryByText('blue sky')).not.toBeInTheDocument()

    const filterSelect = screen.getByLabelText('タグで絞り込み')
    fireEvent.change(filterSelect, { target: { value: 'quality' } })
    expect(screen.queryByText('cat girl')).not.toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: '' } })
    fireEvent.change(filterSelect, { target: { value: 'ALL' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    expect(screen.getByText('blue sky')).toBeInTheDocument()
  })

  it('shows a no-match empty state (not the empty-registry message) when a search matches nothing', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('名前・説明で検索'), { target: { value: 'no such word' } })

    expect(await screen.findByText('該当するワードがありません。')).toBeInTheDocument()
    expect(screen.queryByText('ワードが登録されていません。')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('タグで絞り込み'), { target: { value: 'illustrator' } })
    fireEvent.change(screen.getByLabelText('名前・説明で検索'), { target: { value: 'cat' } })
    expect(screen.getByText('cat girl')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('名前・説明で検索'), { target: { value: 'blue' } })
    expect(await screen.findByText('該当するワードがありません。')).toBeInTheDocument()
  })

  it('groups words by tag with headings in the fixed order when ALL is selected', async () => {
    renderPage()
    await showAllWords()

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Illustrator',
      'Quality',
    ])

    const illustratorGroup = screen.getByRole('heading', { name: 'Illustrator' }).closest('.pbuilder-tag-group')!
    expect(within(illustratorGroup as HTMLElement).getByText('cat girl')).toBeInTheDocument()

    const qualityGroup = screen.getByRole('heading', { name: 'Quality' }).closest('.pbuilder-tag-group')!
    expect(within(qualityGroup as HTMLElement).getByText('blue sky')).toBeInTheDocument()
  })

  it('adds a selected word to the shared output storage when the row is clicked', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: 'cat girlを出力に追加' }))

    expect(await screen.findByText('出力に追加しました')).toBeInTheDocument()
    expect(readOutputItems().map((item) => item.text)).toEqual(['cat girl'])
  })

  it('shows an info toast and does not add a duplicate when the same word is added to the output twice', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    const addButton = within(wordRow).getByRole('button', { name: 'cat girlを出力に追加' })

    fireEvent.click(addButton)
    expect(await screen.findByText('出力に追加しました')).toBeInTheDocument()

    fireEvent.click(addButton)
    expect(await screen.findByText('既に追加されています')).toBeInTheDocument()

    expect(readOutputItems()).toHaveLength(1)
  })

  it('disables adding words until the initial load completes', async () => {
    let resolveLoad: (words: PromptWord[]) => void = () => {}
    vi.mocked(getWords).mockImplementationOnce(() => new Promise<PromptWord[]>((resolve) => { resolveLoad = resolve }))

    renderPage()

    expect(screen.getByLabelText('ワード')).toBeDisabled()
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()

    resolveLoad(sampleWords)
    await screen.findByLabelText('タグで絞り込み')
    expect(screen.getByLabelText('ワード')).toBeEnabled()
  })

  it('disables adding a word until a tag is selected', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'no tag word' } })
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
    expect(screen.getByRole('button', { name: '追加' })).toBeEnabled()
  })

  it('saves the current word list via putWords', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'new word' } })
    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    const saveButton = await screen.findByRole('button', { name: '保存' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(putWords).toHaveBeenCalledTimes(1))
    const [words] = vi.mocked(putWords).mock.calls[0]
    expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'new word'])
    expect(words.map((word) => word.tag)).toEqual(['illustrator', 'quality', 'expression'])
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
  })

  it('deletes a word after confirmation and shows a success toast', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    openRowMenu(wordRow)
    fireEvent.click(within(wordRow).getByRole('menuitem', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(screen.queryByText('cat girl')).not.toBeInTheDocument())
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
  })

  it('does not delete a word when the delete confirmation is cancelled', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    openRowMenu(wordRow)
    fireEvent.click(within(wordRow).getByRole('menuitem', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(screen.getByText('cat girl')).toBeInTheDocument()
  })

  it('shows a success toast after adding a word', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'new word' } })
    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('追加しました')).toBeInTheDocument()
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
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(putWords).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)

      expect(putWords).toHaveBeenCalledTimes(1)
      const [words] = vi.mocked(putWords).mock.calls[0]
      expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'auto word'])
      expect(screen.getByText('保存しました')).toBeInTheDocument()
    })

    it('resets the debounce timer while changes keep happening', async () => {
      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

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
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 3)
      expect(putWords).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(2)
    })

    it('does not double-save when a manual save happens before the debounce fires', async () => {
      renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'manual word' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
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
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
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

      const { unmount } = renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
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

      const { unmount } = renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'only' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
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

      const { unmount } = renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      unmount()
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('first')
    })
  })
})
