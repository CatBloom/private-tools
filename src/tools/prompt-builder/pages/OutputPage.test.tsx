import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { OutputPage } from './OutputPage'
import { getHistory, putHistory } from '../api'
import { writeOutputItems } from '../lib/outputStorage'
import type { HistoryEntry, OutputItem } from '../shared/types'

// OutputPage は useAlert/useConfirm を使うため、常に Provider でラップして render する。
const renderPage = () =>
  render(
    <AlertProvider>
      <ConfirmProvider>
        <OutputPage />
      </ConfirmProvider>
    </AlertProvider>,
  )

const seedOutput = (items: OutputItem[]) => writeOutputItems(items)

vi.mock('../api', () => ({
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

describe('OutputPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getHistory).mockResolvedValue([])
    vi.mocked(putHistory).mockImplementation(async (entries) => entries)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reflects weight changes in the output preview', async () => {
    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()

    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })
    fireEvent.click(screen.getByRole('button', { name: '強める' }))

    expect(await screen.findByText('{cat girl}', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('clears the output after confirmation and shows a success toast', async () => {
    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(screen.getByText('（出力はまだありません）')).toBeInTheDocument())
    expect(await screen.findByText('出力がクリアされました')).toBeInTheDocument()
  })

  it('does not clear the output when the confirmation is cancelled', async () => {
    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(screen.getByText('cat girl', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('copies via document.execCommand first (kept synchronous to preserve iOS user activation), without calling the Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.assign(document, { execCommand })

    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'))
    // コピー成功をトーストで通知し、手動コピーの案内は出さない
    expect(await screen.findByText('コピーしました')).toBeInTheDocument()
    expect(screen.queryByText(/選択済みのテキストを手動でコピーしてください/)).not.toBeInTheDocument()
    // execCommand が成功した場合は Clipboard API を呼ばない
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the Clipboard API when document.execCommand fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(false)
    Object.assign(document, { execCommand })

    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cat girl'))
    // コピー成功をトーストで通知する
    expect(await screen.findByText('コピーしました')).toBeInTheDocument()
  })

  it('falls back to manual selection when both document.execCommand and the Clipboard API fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(false)
    Object.assign(document, { execCommand })

    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))

    expect(await screen.findByText(/選択済みのテキストを手動でコピーしてください/)).toBeInTheDocument()
  })

  it('saves the current output as a named history entry with a selected target via putHistory', async () => {
    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    fireEvent.change(screen.getByLabelText('履歴名'), { target: { value: 'お気に入り' } })
    fireEvent.change(screen.getByLabelText('保存先'), { target: { value: 'character' } })
    fireEvent.click(screen.getByRole('button', { name: '履歴に保存' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledTimes(1))
    const [entries] = vi.mocked(putHistory).mock.calls[0]
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('お気に入り')
    expect(entries[0].target).toBe('character')
    expect(entries[0].items.map((item) => item.text)).toEqual(['cat girl'])
  })

  it('disables saving history when the output is empty', async () => {
    renderPage()

    expect(await screen.findByRole('button', { name: '履歴に保存' })).toBeDisabled()
  })

  it('disables saving history until a save target is selected', async () => {
    seedOutput([{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }])
    renderPage()
    await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })

    expect(screen.getByRole('button', { name: '履歴に保存' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('保存先'), { target: { value: 'negative' } })
    expect(screen.getByRole('button', { name: '履歴に保存' })).toBeEnabled()
  })

  it('groups history entries by target with headings when ALL is selected, then filters flat by a specific target', async () => {
    const entries: HistoryEntry[] = [
      { id: 'h1', name: 'base set', createdAt: '2024-01-01T00:00:00.000Z', items: [], target: 'base' },
      { id: 'h2', name: 'char set', createdAt: '2024-01-02T00:00:00.000Z', items: [], target: 'character' },
    ]
    vi.mocked(getHistory).mockResolvedValue(entries)

    renderPage()
    await screen.findByText('base set', { exact: false })

    const baseGroup = screen.getByRole('heading', { name: 'Base' }).closest('.pbuilder-tag-group')!
    expect(within(baseGroup as HTMLElement).getByText('base set', { exact: false })).toBeInTheDocument()

    const characterGroup = screen.getByRole('heading', { name: 'Character' }).closest('.pbuilder-tag-group')!
    expect(within(characterGroup as HTMLElement).getByText('char set', { exact: false })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('保存先で絞り込み'), { target: { value: 'character' } })

    // 特定 target 絞り込みではグループ見出しを出さず、フラット表示に戻る。
    expect(screen.queryByRole('heading', { name: 'Base' })).not.toBeInTheDocument()
    expect(screen.queryByText('base set', { exact: false })).not.toBeInTheDocument()
    expect(screen.getByText('char set', { exact: false })).toBeInTheDocument()
  })

  it('restores a history entry into the current output', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    expect(await screen.findByText('saved set', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '復元' }))

    expect(await screen.findByText('cat girl', { selector: '.pbuilder-output-text' })).toBeInTheDocument()
  })

  it('shows a success toast when restoring a history entry', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '復元' }))

    expect(await screen.findByText('復元しました')).toBeInTheDocument()
  })

  it('disables history delete buttons while a delete is in flight (prevents lost updates)', async () => {
    const entries: HistoryEntry[] = [
      { id: 'h1', name: 'set one', createdAt: '2024-01-01T00:00:00.000Z', items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }], target: 'base' },
      { id: 'h2', name: 'set two', createdAt: '2024-01-02T00:00:00.000Z', items: [{ id: 'i2', wordId: 'w2', text: 'blue sky', weight: 0 }], target: 'negative' },
    ]
    vi.mocked(getHistory).mockResolvedValue(entries)
    let resolvePut: (value: HistoryEntry[]) => void = () => {}
    vi.mocked(putHistory).mockImplementation(() => new Promise<HistoryEntry[]>((resolve) => { resolvePut = resolve }))

    renderPage()
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
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledWith([]))
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
  })

  it('does not delete the history entry when the confirmation is cancelled', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(putHistory).not.toHaveBeenCalled()
    expect(screen.getByText('saved set', { exact: false })).toBeInTheDocument()
  })

  it("renames a history entry's name via putHistory, keeping its items and target intact", async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    const nameInput = screen.getAllByLabelText('履歴名').find((el) => (el as HTMLInputElement).value === 'saved set')!
    fireEvent.change(nameInput, { target: { value: 'renamed set' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledTimes(1))
    expect(putHistory).toHaveBeenCalledWith([{ ...entry, name: 'renamed set' }])
    expect(await screen.findByText('renamed set', { exact: false })).toBeInTheDocument()
    expect(await screen.findByText('履歴を更新しました')).toBeInTheDocument()
  })

  it("changes a history entry's target via putHistory, keeping its name and items intact", async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    const targetSelect = screen
      .getAllByLabelText('保存先')
      .find((el) => (el as HTMLSelectElement).value === 'base')!
    fireEvent.change(targetSelect, { target: { value: 'negative' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(putHistory).toHaveBeenCalledTimes(1))
    expect(putHistory).toHaveBeenCalledWith([{ ...entry, target: 'negative' }])
    // ALL 絞り込みのままなので、target 変更後は "negative" グループに移って見出しが出る。
    expect(await screen.findByRole('heading', { name: 'Negative' })).toBeInTheDocument()
    expect(await screen.findByText('履歴を更新しました')).toBeInTheDocument()
  })

  it('does not change the history entry name when the rename is cancelled', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      name: 'saved set',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [{ id: 'i1', wordId: 'w1', text: 'cat girl', weight: 0 }],
      target: 'base',
    }
    vi.mocked(getHistory).mockResolvedValue([entry])

    renderPage()
    await screen.findByText('saved set', { exact: false })

    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    const nameInput = screen.getAllByLabelText('履歴名').find((el) => (el as HTMLInputElement).value === 'saved set')!
    fireEvent.change(nameInput, { target: { value: 'renamed set' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(putHistory).not.toHaveBeenCalled()
    expect(screen.getByText('saved set', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('renamed set', { exact: false })).not.toBeInTheDocument()
  })
})
