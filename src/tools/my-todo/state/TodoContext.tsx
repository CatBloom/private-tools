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
// 保存はデバウンス無しの即時 PUT（ユーザー要望「追加・変更時に即保存／時間制にしない」）。
// ただし送信は直列化する: in-flight 中の変更は待たせておき、完了後に最新値との差分が
// あればもう一度だけ送る（in-flight guard + 最新へ集約）。これで同時実行は高々1本、
// 連続操作（連打トグル・並べ替え）でも中間状態は畳まれて最終状態だけが届き、書き込み
// 回数を最小化する。※これは「往復時間に律速して1000回/日枠を無駄打ちしない」ための集約で
// あって、KV の「同一キー1秒1回」の最小間隔を厳密に保証するものではない（即時保存を優先した
// 設計判断。個人利用の頻度では日次枠に十分収まる）。失敗時は自動リトライしない
// （lastSentRef を進めないので、次の操作が再アームする）。
export const TodoProvider = ({ children }: { children: ReactNode }) => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()

  const [todoState, setTodoState] = useState<TodoState>(EMPTY_STATE)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // 保存直列化の判定・rollover 等が常に最新値を読めるようにするための ref（stale closure 対策）。
  const todoStateRef = useRef(todoState)
  todoStateRef.current = todoState
  // 直近で putTodos に「成功」したスナップショット（参照）。これと現在値が同じ参照なら
  // 「保存すべき差分が無い」とみなす（失敗時は更新しない）。
  const lastSentRef = useRef<TodoState | null>(null)
  // 実行中の putTodos（常に高々1つ）。in-flight の間に来た変更はここでは送らず、
  // 完了後に最新値との差分を見て必要なら続けて1回だけ送る。
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  const runSave = useCallback(
    (snapshot: TodoState) => {
      setSaveStatus('saving')
      setSaveError(null)
      const request = putTodos(snapshot)
      inFlightRef.current = request
      request.then(
        () => {
          lastSentRef.current = snapshot
          inFlightRef.current = null
          if (todoStateRef.current !== snapshot) {
            // 通信中にさらに変更があった。最新の状態でもう一度だけ送る。
            runSave(todoStateRef.current)
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

  const scheduleSave = useCallback(() => {
    if (inFlightRef.current) return
    const snapshot = todoStateRef.current
    if (snapshot === lastSentRef.current) return
    runSave(snapshot)
  }, [runSave])

  const loadTodos = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const state = await getTodos()
      setTodoState(state)
      // 取得直後はサーバーと一致しているので送信済み扱いにする（読み込み直後の空撃ち保存を防ぐ）。
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

  // 初回ロード完了時にローカル日付で繰り越しを適用する。同一日なら rollover 自体が
  // no-op（同じ参照）を返すので、loadStatus が 'ready' のまま再レンダーされても副作用は起きない。
  useEffect(() => {
    if (loadStatus !== 'ready') return
    const today = toLocalDateString(new Date())
    const rolled = rollover(todoStateRef.current, today)
    if (rolled !== todoStateRef.current) setTodoState(rolled)
  }, [loadStatus])

  // 状態が変わるたび即時保存する（10秒デバウンスは廃止）。読み込み直後・保存成功直後は
  // todoState === lastSentRef.current のため scheduleSave は no-op になる。
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

  // moveItem の判定・確定は todoStateRef から直接読む（functional setState の updater 内で
  // showAlert のような副作用を呼ぶと、React が updater を再実行した場合に二重発火し得るため）。
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
