import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { WordsPage } from './WordsPage'
import { getWords, putWords } from '../api'
import { readOutputItems } from '../lib/outputStorage'
import type { PromptWord } from '../shared/types'

// WordsPage は useAlert/useConfirm を使うため、常に Provider でラップして render する。
const renderPage = () =>
  render(
    <AlertProvider>
      <ConfirmProvider>
        <WordsPage />
      </ConfirmProvider>
    </AlertProvider>,
  )

// ワード一覧は既定でタグ ALL（全件・グループ表示）なので、一覧を操作するテストは
// 読み込み完了の待ち合わせだけしてから進める。
const showAllWords = async () => {
  await screen.findByLabelText('タグで絞り込み')
  return screen.findByText('cat girl')
}

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

  it('groups words by tag with headings in the fixed order when ALL is selected', async () => {
    renderPage()
    await showAllWords()

    // 固定順は angle, composition, expression, illustrator, pose, quality, situation, others。
    // 0件のタグは見出しごと出さないので、sampleWords に存在する illustrator/quality のみ表示される。
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Illustrator',
      'Quality',
    ])

    const illustratorGroup = screen.getByRole('heading', { name: 'Illustrator' }).closest('.pbuilder-tag-group')!
    expect(within(illustratorGroup as HTMLElement).getByText('cat girl')).toBeInTheDocument()

    const qualityGroup = screen.getByRole('heading', { name: 'Quality' }).closest('.pbuilder-tag-group')!
    expect(within(qualityGroup as HTMLElement).getByText('blue sky')).toBeInTheDocument()
  })

  it('adds a selected word to the shared output storage', async () => {
    renderPage()
    await showAllWords()

    const wordRow = screen.getByText('cat girl').closest('li')!
    fireEvent.click(within(wordRow).getByRole('button', { name: '出力に追加' }))

    expect(await screen.findByText('出力に追加しました')).toBeInTheDocument()
    expect(readOutputItems().map((item) => item.text)).toEqual(['cat girl'])
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

    expect(readOutputItems()).toHaveLength(1)
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

  it('disables adding a word until a tag is selected', async () => {
    renderPage()
    await showAllWords()

    fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'no tag word' } })
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
    expect(screen.getByRole('button', { name: '追加' })).toBeEnabled()
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
    const [words] = vi.mocked(putWords).mock.calls[0]
    expect(words.map((word) => word.text)).toEqual(['cat girl', 'blue sky', 'new word'])
    expect(words.map((word) => word.tag)).toEqual(['illustrator', 'quality', 'pose'])
    // 手動保存は成功トーストを出す
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
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
      const [words] = vi.mocked(putWords).mock.calls[0]
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
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('second')
    })

    it('flushes the newest edit on unmount when navigating during an in-flight save', async () => {
      // 1回目の保存は解決させない（通信中のまま）。この間の再編集がアンマウントで失われないこと。
      vi.mocked(putWords).mockImplementationOnce(() => new Promise<PromptWord[]>(() => {}))

      const { unmount } = renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1) // 通信中（未解決）

      // 通信中に別のワードを追加し、保存が終わる前にページ遷移（アンマウント）する
      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'second' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      unmount()

      // アンマウント flush で最新（'second' を含む）が送られ、遷移で編集が消えない
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('second')
    })

    it('re-sends the pending edit on unmount after a failed save with no further edits', async () => {
      vi.mocked(putWords).mockRejectedValueOnce(new Error('save failed'))

      const { unmount } = renderPage()
      await showAllWords()

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'first' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'pose' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS)
      expect(putWords).toHaveBeenCalledTimes(1)
      await screen.findByText('save failed')

      // 失敗後、追加編集せずに遷移（アンマウント）しても、未保存の変更が再送される
      unmount()
      await waitFor(() => expect(putWords).toHaveBeenCalledTimes(2))
      expect(vi.mocked(putWords).mock.calls[1][0].map((word) => word.text)).toContain('first')
    })
  })
})
