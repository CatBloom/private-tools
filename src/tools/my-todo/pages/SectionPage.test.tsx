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

// jsdom はドラッグ操作を再現できないため、@dnd-kit はレンダリングだけ通す最小モックにする
// （並べ替えの結線は reorder.test.ts で検証し、ここでは Context 経由の保存直列化・表示だけを見る）。
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

// lastRolloverDate をローカル今日日付に揃え、ロード直後の繰り越し処理で状態が変わって
// 余計な保存が走らないようにする（このテストの関心事は繰り越しではなく保存の直列化）。
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

    // 1件目がまだ in-flight のうちに2件追加しても、その間は再送されない。
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: 'third' } })
    fireEvent.click(addButton)
    expect(putTodos).toHaveBeenCalledTimes(1)

    // 1件目の完了後、最新状態でもう一度だけ送る（3件目・2件目を個別には送らない）。
    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(2))
    expect(vi.mocked(putTodos).mock.calls[1][0].today.map((item) => item.text)).toEqual(['first', 'second', 'third'])

    resolvers[1](vi.mocked(putTodos).mock.calls[1][0])
    await waitFor(() => expect(screen.getByText('保存済み')).toBeInTheDocument())
  })
})
