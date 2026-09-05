import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAlert, useConfirm } from '../../../components/feedback'
import { getTodos, putTodos } from '../api'
import { canPlaceInToday, moveItem } from '../lib/move'
import { reorder } from '../lib/reorder'
import { rollover, toLocalDateString } from '../lib/rollover'
import { TODAY_LIMIT, type TodoItem, type TodoSectionId, type TodoState } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const EMPTY_STATE: TodoState = { today: [], someday: [], lastRolloverDate: null }

// KV の「同一キー1秒1回」制約を守るための書き込み最小間隔（1秒未満の連続編集だけ遅延させる）。
const MIN_WRITE_INTERVAL_MS = 1000

const createItem = (text: string): TodoItem => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  completed: false,
  createdAt: new Date().toISOString(),
})

type TodoContextValue = {
  todoState: TodoState
  loadStatus: LoadStatus
  loadError: string | null
  reloadTodos: () => void
  saveStatus: SaveStatus
  saveError: string | null
  addItem: (section: TodoSectionId, text: string) => void
  toggleCompleted: (section: TodoSectionId, id: string) => void
  editItem: (section: TodoSectionId, id: string, text: string) => void
  deleteItem: (section: TodoSectionId, id: string) => Promise<void>
  moveToSection: (from: TodoSectionId, id: string) => void
  reorderSection: (section: TodoSectionId, fromIndex: number, toIndex: number) => void
}

const TodoContext = createContext<TodoContextValue | null>(null)

// Today/Someday の状態を1箇所に持ち上げ、ページ（ルート）を切り替えても保持する。
// 保存はデバウンス無しの即時 PUT が基本だが、送信は常に直列化1本（in-flight 中の変更は
// 完了後にまとめて再送）し、失敗時は自動リトライしない（次の操作が再アームする）。
export const TodoProvider = ({ children }: { children: ReactNode }) => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()

  const [todoState, setTodoState] = useState<TodoState>(EMPTY_STATE)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // stale closure 対策（保存判定・rollover が常に最新値を読めるようにする）。
  const todoStateRef = useRef(todoState)
  todoStateRef.current = todoState
  // 直近で putTodos に成功したスナップショット参照。同一参照なら差分無しとみなす（失敗時は更新しない）。
  const lastSentRef = useRef<TodoState | null>(null)
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  const lastWriteStartedAtRef = useRef<number | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // scheduleSave は runSave より後に定義されるため useCallback の依存配列に直接書けない（TDZ）。ref 経由で呼ぶ。
  const scheduleSaveRef = useRef<() => void>(() => {})

  const runSave = useCallback(
    (snapshot: TodoState) => {
      setSaveStatus('saving')
      setSaveError(null)
      lastWriteStartedAtRef.current = Date.now()
      const request = putTodos(snapshot)
      inFlightRef.current = request
      request.then(
        () => {
          lastSentRef.current = snapshot
          inFlightRef.current = null
          if (todoStateRef.current !== snapshot) {
            // 通信中にさらに変更があった。scheduleSave 経由でもう一度だけ送る。
            scheduleSaveRef.current()
          } else {
            setSaveStatus('saved')
          }
        },
        (error: unknown) => {
          inFlightRef.current = null
          const message = error instanceof Error ? error.message : '保存に失敗しました。'
          setSaveError(message)
          setSaveStatus('error')
          showAlert('error', message)
        },
      )
    },
    [showAlert],
  )

  // 保存の唯一のエントリポイント。in-flight 中・差分無しなら何もしない。
  const scheduleSave = useCallback(() => {
    if (inFlightRef.current) return
    const snapshot = todoStateRef.current
    if (snapshot === lastSentRef.current) return

    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }

    const elapsed = lastWriteStartedAtRef.current === null ? Infinity : Date.now() - lastWriteStartedAtRef.current
    const delay = Math.max(0, MIN_WRITE_INTERVAL_MS - elapsed)

    if (delay <= 0) {
      runSave(snapshot)
      return
    }

    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null
      scheduleSave()
    }, delay)
  }, [runSave])
  scheduleSaveRef.current = scheduleSave

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }
  }, [])

  const loadTodos = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const state = await getTodos()
      setTodoState(state)
      // 読み込み直後の空撃ち保存を防ぐため送信済み扱いにする。
      lastSentRef.current = state
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    loadTodos()
  }, [loadTodos])

  // 同一日なら rollover は同じ参照を返す（no-op）ので、再レンダーされても副作用は起きない。
  useEffect(() => {
    if (loadStatus !== 'ready') return
    const today = toLocalDateString(new Date())
    const rolled = rollover(todoStateRef.current, today)
    if (rolled !== todoStateRef.current) setTodoState(rolled)
  }, [loadStatus])

  useEffect(() => {
    if (loadStatus !== 'ready') return
    scheduleSave()
  }, [todoState, loadStatus, scheduleSave])

  const addItem = useCallback(
    (section: TodoSectionId, text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loadStatus !== 'ready') return
      if (section === 'today' && !canPlaceInToday(todoStateRef.current.today, false)) return

      setTodoState((current) => ({ ...current, [section]: [...current[section], createItem(trimmed)] }))
    },
    [loadStatus],
  )

  const toggleCompleted = useCallback((section: TodoSectionId, id: string) => {
    setTodoState((current) => ({
      ...current,
      [section]: current[section].map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)),
    }))
  }, [])

  const editItem = useCallback((section: TodoSectionId, id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setTodoState((current) => ({
      ...current,
      [section]: current[section].map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
    }))
  }, [])

  const deleteItem = useCallback(
    async (section: TodoSectionId, id: string) => {
      const confirmed = await confirm('このタスクを削除しますか？', { title: '削除', danger: true })
      if (!confirmed) return

      setTodoState((current) => ({ ...current, [section]: current[section].filter((item) => item.id !== id) }))
      showAlert('success', '削除しました')
    },
    [confirm, showAlert],
  )

  // functional setState の updater 内で showAlert を呼ぶと再実行時に二重発火し得るため todoStateRef から直接読む。
  const moveToSection = useCallback(
    (from: TodoSectionId, id: string) => {
      const to: TodoSectionId = from === 'today' ? 'someday' : 'today'
      const moved = moveItem(todoStateRef.current, id, from, to)
      if (moved === todoStateRef.current) {
        showAlert('info', `Todayは未完了${TODAY_LIMIT}件までです`)
        return
      }
      setTodoState(moved)
    },
    [showAlert],
  )

  const reorderSection = useCallback((section: TodoSectionId, fromIndex: number, toIndex: number) => {
    const current = todoStateRef.current
    const reordered = reorder(current[section], fromIndex, toIndex)
    if (reordered === current[section]) return
    setTodoState({ ...current, [section]: reordered })
  }, [])

  const value: TodoContextValue = {
    todoState,
    loadStatus,
    loadError,
    reloadTodos: loadTodos,
    saveStatus,
    saveError,
    addItem,
    toggleCompleted,
    editItem,
    deleteItem,
    moveToSection,
    reorderSection,
  }

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>
}

export const useTodo = (): TodoContextValue => {
  const context = useContext(TodoContext)
  if (!context) {
    throw new Error('useTodo must be used within a TodoProvider')
  }
  return context
}
