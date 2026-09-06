import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { getTodos, putTodos } from '../api'
import { toLocalDateString } from '../lib/rollover'
import { TodoProvider } from '../state/TodoContext'
import type { TodoState } from '../shared/types'
import { SectionPage } from './SectionPage'

vi.mock('../api', () => ({
  getTodos: vi.fn(),
  putTodos: vi.fn(),
}))

// jsdom はドラッグを再現できないため @dnd-kit はレンダリングのみのモック（並べ替えは reorder.test.ts で検証）。
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  useDroppable: () => ({ setNodeRef: vi.fn() }),
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

// lastRolloverDate を今日に揃え、繰り越し処理による余計な保存を防ぐ。
const emptyState = (): TodoState => ({ today: [], someday: [], lastRolloverDate: toLocalDateString(new Date()) })

const renderSection = () =>
  render(
    <AlertProvider>
      <ConfirmProvider>
        <TodoProvider>
          <SectionPage section="today" />
        </TodoProvider>
      </ConfirmProvider>
    </AlertProvider>,
  )

describe('SectionPage', () => {
  beforeEach(() => {
    vi.mocked(getTodos).mockResolvedValue(emptyState())
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // フェイクタイマーのテストが失敗した場合でも以降のテストに漏れ出さないようにする。
    vi.useRealTimers()
  })

  it('renders items loaded for the given section', async () => {
    vi.mocked(getTodos).mockResolvedValue({
      today: [{ id: 't1', text: 'water the plants', completed: false, createdAt: '2026-09-01T00:00:00.000Z' }],
      someday: [],
      lastRolloverDate: toLocalDateString(new Date()),
    })
    renderSection()

    expect(await screen.findByText('water the plants')).toBeInTheDocument()
  })

  it('saves immediately (no debounce) after adding an item', async () => {
    vi.mocked(putTodos).mockImplementation(async (state) => state)
    renderSection()

    const input = await screen.findByPlaceholderText('タスクを追加')
    fireEvent.change(input, { target: { value: 'buy milk' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(1))
    expect(vi.mocked(putTodos).mock.calls[0][0].today.map((item) => item.text)).toContain('buy milk')
  })

  it('coalesces saves made while a request is in-flight into a single follow-up request', async () => {
    const resolvers: Array<(state: TodoState) => void> = []
    vi.mocked(putTodos).mockImplementation(
      (state) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(state))
        }),
    )
    renderSection()

    const input = await screen.findByPlaceholderText('タスクを追加')
    const addButton = screen.getByRole('button', { name: '追加' })

    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.click(addButton)
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(1))

    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: 'third' } })
    fireEvent.click(addButton)
    expect(putTodos).toHaveBeenCalledTimes(1)

    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(vi.mocked(putTodos).mock.calls[1][0].today.map((item) => item.text)).toEqual(['first', 'second', 'third'])

    resolvers[1](vi.mocked(putTodos).mock.calls[1][0])
    await waitFor(() => expect(screen.queryByText('保存中…')).not.toBeInTheDocument())
  }, 10_000)

  it('spaces a burst of writes to respect the minimum write interval (single edits stay immediate)', async () => {
    const resolvers: Array<(state: TodoState) => void> = []
    vi.mocked(putTodos).mockImplementation(
      (state) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(state))
        }),
    )
    renderSection()

    const input = await screen.findByPlaceholderText('タスクを追加')
    const addButton = screen.getByRole('button', { name: '追加' })

    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.click(addButton)
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(1))

    vi.useFakeTimers()

    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: 'third' } })
    fireEvent.click(addButton)
    expect(putTodos).toHaveBeenCalledTimes(1)

    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await vi.advanceTimersByTimeAsync(0)
    expect(putTodos).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(putTodos).toHaveBeenCalledTimes(2)
    expect(vi.mocked(putTodos).mock.calls[1][0].today.map((item) => item.text)).toEqual(['first', 'second', 'third'])

    resolvers[1](vi.mocked(putTodos).mock.calls[1][0])
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.queryByText('保存中…')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('clears the pending write timer on unmount so a delayed follow-up never fires', async () => {
    const resolvers: Array<(state: TodoState) => void> = []
    vi.mocked(putTodos).mockImplementation(
      (state) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(state))
        }),
    )
    const { unmount } = renderSection()

    const input = await screen.findByPlaceholderText('タスクを追加')
    const addButton = screen.getByRole('button', { name: '追加' })

    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.click(addButton)
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(1))

    vi.useFakeTimers()

    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.click(addButton)

    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await vi.advanceTimersByTimeAsync(0)
    expect(putTodos).toHaveBeenCalledTimes(1)

    unmount()

    await vi.advanceTimersByTimeAsync(2000)
    expect(putTodos).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('edits an item via the row overflow menu (⋯ → 編集)', async () => {
    vi.mocked(getTodos).mockResolvedValue({
      today: [{ id: 't1', text: 'water the plants', completed: false, createdAt: '2026-09-01T00:00:00.000Z' }],
      someday: [],
      lastRolloverDate: toLocalDateString(new Date()),
    })
    vi.mocked(putTodos).mockImplementation(async (state) => state)
    renderSection()

    await screen.findByText('water the plants')
    fireEvent.click(screen.getByRole('button', { name: '操作メニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '編集' }))

    expect(screen.getByLabelText('タスク')).toHaveValue('water the plants')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
