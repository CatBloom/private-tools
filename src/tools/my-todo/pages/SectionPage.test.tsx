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
    // フェイクタイマーを使うテストが途中で失敗した場合でも、以降のテストに fake timers が
    // 漏れ出さないようにする（vi.useRealTimers は real timers 中に呼んでも安全）。
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

    // 1件目がまだ in-flight のうちに2件追加しても、その間は再送されない。
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: 'third' } })
    fireEvent.click(addButton)
    expect(putTodos).toHaveBeenCalledTimes(1)

    // 1件目の完了後、最新状態でもう一度だけ送る（3件目・2件目を個別には送らない）。書き込み
    // 最小間隔のゲートで即時には送られない可能性があるため、余裕を持った timeout で待つ
    // （フェイクタイマーを使う厳密なタイミング検証は下の2ケースで行う）。
    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(vi.mocked(putTodos).mock.calls[1][0].today.map((item) => item.text)).toEqual(['first', 'second', 'third'])

    resolvers[1](vi.mocked(putTodos).mock.calls[1][0])
    await waitFor(() => expect(screen.getByText('保存済み')).toBeInTheDocument())
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

    // 単発の編集は前回書き込みから十分時間が経っている（初回）ため即時に送られる。
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.click(addButton)
    await waitFor(() => expect(putTodos).toHaveBeenCalledTimes(1))

    // ここから先だけタイマー・Date.now を fake にして、間隔ゲートのタイミングを厳密に検証する
    // （切り替え時点の実時刻を引き継ぐので、直前に記録した書き込み開始時刻との差分計算は壊れない）。
    vi.useFakeTimers()

    // 1件目がまだ in-flight のうちに2件追加（バースト）。
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: 'third' } })
    fireEvent.click(addButton)
    expect(putTodos).toHaveBeenCalledTimes(1)

    // 1件目が完了しても、前回の書き込み開始からまだ最小間隔（1秒）経っていないので
    // follow-up はまだ送られない（pending タイマーで待たされる）。
    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await vi.advanceTimersByTimeAsync(0)
    expect(putTodos).toHaveBeenCalledTimes(1)

    // 残り時間が経過すると、畳まれた最新状態でもう一度だけ送る。
    await vi.advanceTimersByTimeAsync(1000)
    expect(putTodos).toHaveBeenCalledTimes(2)
    expect(vi.mocked(putTodos).mock.calls[1][0].today.map((item) => item.text)).toEqual(['first', 'second', 'third'])

    resolvers[1](vi.mocked(putTodos).mock.calls[1][0])
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByText('保存済み')).toBeInTheDocument()

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

    // 1件目の完了で follow-up の pending タイマーが張られる（最小間隔未満なのでまだ送らない）。
    resolvers[0](vi.mocked(putTodos).mock.calls[0][0])
    await vi.advanceTimersByTimeAsync(0)
    expect(putTodos).toHaveBeenCalledTimes(1)

    unmount()

    // アンマウントで pending タイマーが clear されていれば、時間を進めても送信されない。
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

    // インライン編集に切り替わり、メニューは閉じている（"編集"の項目は無くなる）。
    expect(screen.getByLabelText('タスク')).toHaveValue('water the plants')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
