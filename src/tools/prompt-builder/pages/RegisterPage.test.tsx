import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { getWords, putWords } from '../api'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import { WordsProvider } from '../state/WordsProvider'
import type { PromptWord } from '../shared/types'
import { RegisterPage } from './RegisterPage'

vi.mock('../api', () => ({
  getWords: vi.fn(),
  putWords: vi.fn(),
}))

const sampleWords: PromptWord[] = [
  { id: 'w1', text: 'cat girl', description: 'ネコ耳キャラ', tag: 'illustrator' },
  { id: 'w2', text: 'blue sky', description: '', tag: 'quality' },
]

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/register']}>
      <AlertProvider>
        <ConfirmProvider>
          <WordsProvider>
            <Routes>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/output" element={<p>出力ページ</p>} />
            </Routes>
          </WordsProvider>
        </ConfirmProvider>
      </AlertProvider>
    </MemoryRouter>,
  )

describe('RegisterPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getWords).mockResolvedValue(sampleWords)
    vi.mocked(putWords).mockImplementation(async (words) => words)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('single word registration', () => {
    it('disables adding words until the initial load completes', async () => {
      let resolveLoad: (words: PromptWord[]) => void = () => {}
      vi.mocked(getWords).mockImplementationOnce(() => new Promise<PromptWord[]>((resolve) => { resolveLoad = resolve }))

      renderPage()

      expect(screen.getByLabelText('ワード')).toBeDisabled()
      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()

      resolveLoad(sampleWords)
      await waitFor(() => expect(screen.getByLabelText('ワード')).toBeEnabled())
    })

    it('disables adding a word until a tag is selected', async () => {
      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'no tag word' } })
      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()

      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      expect(screen.getByRole('button', { name: '追加' })).toBeEnabled()
    })

    it('shows a success toast after adding a word', async () => {
      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'new word' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(await screen.findByText('追加しました')).toBeInTheDocument()
      expect(screen.getByLabelText('ワード')).toHaveValue('')
    })

    it('shows an error toast and does not register when the word limit would be exceeded', async () => {
      const nearLimitWords: PromptWord[] = Array.from({ length: 2000 }, (_, index) => ({
        id: `w${index}`,
        text: `word ${index}`,
        description: '',
        tag: 'others',
      }))
      vi.mocked(getWords).mockResolvedValue(nearLimitWords)

      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('ワード'), { target: { value: 'over limit' } })
      fireEvent.change(screen.getByLabelText('タグ'), { target: { value: 'expression' } })
      fireEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(await screen.findByText(/上限（2000件）を超える/)).toBeInTheDocument()
    })
  })

  describe('prompt decomposition', () => {
    it('shows rows as soon as the textarea has content, with no decompose button', async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      expect(screen.queryByRole('button', { name: '分解' })).not.toBeInTheDocument()
      expect(container.querySelectorAll('.prompt-builder-decompose-row')).toHaveLength(0)

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA' } })

      expect(container.querySelectorAll('.prompt-builder-decompose-row')).toHaveLength(1)
    })

    it('splits the input on comma into rows with the default tag', async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB,{{CCCC}}' } })

      const rows = container.querySelectorAll('.prompt-builder-decompose-row')
      expect(rows).toHaveLength(3)
      expect(within(rows[0] as HTMLElement).getByLabelText('ワード')).toHaveValue('AAAA')
      expect(within(rows[1] as HTMLElement).getByLabelText('ワード')).toHaveValue('BBBB')
      expect(within(rows[2] as HTMLElement).getByLabelText('ワード')).toHaveValue('CCCC')
      expect(within(rows[0] as HTMLElement).getByLabelText('タグ')).toHaveValue('others')
    })

    it("keeps a row's edited tag when more text is appended to the textarea", async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB' } })

      const firstRow = () => container.querySelectorAll('.prompt-builder-decompose-row')[0] as HTMLElement
      fireEvent.change(within(firstRow()).getByLabelText('タグ'), { target: { value: 'expression' } })
      expect(within(firstRow()).getByLabelText('タグ')).toHaveValue('expression')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB,DDDD' } })

      expect(container.querySelectorAll('.prompt-builder-decompose-row')).toHaveLength(3)
      expect(within(firstRow()).getByLabelText('タグ')).toHaveValue('expression')
    })

    it('shows a confirm dialog before removing a row via ×, then rewrites the textarea and shows a toast', async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB,{{CCCC}}' } })

      const getRows = () => container.querySelectorAll('.prompt-builder-decompose-row')
      expect(getRows()).toHaveLength(3)

      fireEvent.click(within(getRows()[1] as HTMLElement).getByRole('button', { name: 'この行を外す' }))

      // 確認するまでは何も変わらない。
      expect(screen.getByLabelText('分解するプロンプト')).toHaveValue('AAAA,BBBB,{{CCCC}}')
      expect(getRows()).toHaveLength(3)

      fireEvent.click(await screen.findByRole('button', { name: '削除' }))

      await waitFor(() => expect(screen.getByLabelText('分解するプロンプト')).toHaveValue('AAAA, {{CCCC}}'))
      expect(getRows()).toHaveLength(2)
      expect(await screen.findByText('BBBBを外しました')).toBeInTheDocument()
    })

    it('does not remove the row when the confirm dialog is cancelled', async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB,{{CCCC}}' } })

      const getRows = () => container.querySelectorAll('.prompt-builder-decompose-row')
      fireEvent.click(within(getRows()[1] as HTMLElement).getByRole('button', { name: 'この行を外す' }))

      fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

      expect(screen.getByLabelText('分解するプロンプト')).toHaveValue('AAAA,BBBB,{{CCCC}}')
      expect(getRows()).toHaveLength(3)
    })

    it('disables the row inputs and adds a title (with no badge text) when the text matches an existing word', async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,blue sky' } })

      const rows = container.querySelectorAll('.prompt-builder-decompose-row')
      expect(within(rows[1] as HTMLElement).getByLabelText('ワード')).toBeDisabled()
      expect(within(rows[1] as HTMLElement).getByLabelText('説明')).toBeDisabled()
      expect(within(rows[1] as HTMLElement).getByLabelText('タグ')).toBeDisabled()
      expect(rows[1]).toHaveAttribute('title', '既に登録されています')
      expect(within(rows[1] as HTMLElement).queryByText('既登録')).not.toBeInTheDocument()
      // 既登録の行でも「出力へ」の対象から外せるよう、✕ は押せる状態のままにする。
      expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'この行を外す' })).toBeEnabled()

      expect(within(rows[0] as HTMLElement).getByLabelText('ワード')).toBeEnabled()
      expect(rows[0]).not.toHaveAttribute('title')
    })

    it('registers only the unregistered rows via "すべて追加" and disables it when none remain', async () => {
      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,blue sky,CCCC' } })

      const registerAllButton = screen.getByRole('button', { name: 'すべて追加' })
      expect(registerAllButton).toBeEnabled()

      fireEvent.click(registerAllButton)

      expect(await screen.findByText('2件登録しました')).toBeInTheDocument()
      expect(registerAllButton).toBeDisabled()
      const rows = container.querySelectorAll('.prompt-builder-decompose-row')
      expect(within(rows[0] as HTMLElement).getByLabelText('ワード')).toBeDisabled()
      expect(within(rows[1] as HTMLElement).getByLabelText('ワード')).toBeDisabled()
      expect(within(rows[2] as HTMLElement).getByLabelText('ワード')).toBeDisabled()
    })

    it('disables "すべて追加" when there are no unregistered rows to add', async () => {
      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'cat girl' } })

      expect(screen.getByRole('button', { name: 'すべて追加' })).toBeDisabled()
    })

    it('disables "すべて追加" until the initial load completes, then enables it once ready', async () => {
      let resolveLoad: (words: PromptWord[]) => void = () => {}
      vi.mocked(getWords).mockImplementationOnce(
        () => new Promise<PromptWord[]>((resolve) => { resolveLoad = resolve }),
      )

      renderPage()

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB' } })
      expect(screen.getByRole('button', { name: 'すべて追加' })).toBeDisabled()

      resolveLoad(sampleWords)
      await waitFor(() => expect(screen.getByRole('button', { name: 'すべて追加' })).toBeEnabled())
    })

    it('shows an error toast and registers nothing via "すべて追加" when the word limit would be exceeded', async () => {
      const nearLimitWords: PromptWord[] = Array.from({ length: 1999 }, (_, index) => ({
        id: `w${index}`,
        text: `word ${index}`,
        description: '',
        tag: 'others',
      }))
      vi.mocked(getWords).mockResolvedValue(nearLimitWords)

      const { container } = renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB' } })

      fireEvent.click(screen.getByRole('button', { name: 'すべて追加' }))

      expect(await screen.findByText(/上限（2000件）を超える/)).toBeInTheDocument()
      const rows = container.querySelectorAll('.prompt-builder-decompose-row')
      expect(within(rows[0] as HTMLElement).getByLabelText('ワード')).toBeEnabled()
      expect(within(rows[1] as HTMLElement).getByLabelText('ワード')).toBeEnabled()
    })

    it('disables "出力へ" when there are no rows', async () => {
      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      expect(screen.getByRole('button', { name: '出力へ' })).toBeDisabled()
    })

    it('sends the whole decomposition to the output storage and navigates immediately when the output is empty', async () => {
      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA,BBBB,{{CCCC}}' } })
      fireEvent.click(screen.getByRole('button', { name: '出力へ' }))

      expect(await screen.findByText('出力ページ')).toBeInTheDocument()
      const items = readOutputItems()
      expect(items.map((item) => ({ text: item.text, weight: item.weight, wordId: item.wordId }))).toEqual([
        { text: 'AAAA', weight: 0, wordId: null },
        { text: 'BBBB', weight: 0, wordId: null },
        { text: 'CCCC', weight: 2, wordId: null },
      ])
    })

    it('asks for confirmation before replacing a non-empty output, and only replaces it when confirmed', async () => {
      writeOutputItems([{ id: 'existing', wordId: null, text: 'existing', weight: 0 }])

      renderPage()
      await screen.findByLabelText('分解するプロンプト')

      fireEvent.change(screen.getByLabelText('分解するプロンプト'), { target: { value: 'AAAA' } })
      fireEvent.click(screen.getByRole('button', { name: '出力へ' }))

      fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
      expect(screen.queryByText('出力ページ')).not.toBeInTheDocument()
      expect(readOutputItems()).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: '出力へ' }))
      fireEvent.click(await screen.findByRole('button', { name: '置き換え' }))

      expect(await screen.findByText('出力ページ')).toBeInTheDocument()
      expect(readOutputItems().map((item) => item.text)).toEqual(['AAAA'])
    })
  })
})
