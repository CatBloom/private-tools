import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAlert, useConfirm } from '../../../components/feedback'
import { useGatedSave, type SaveStatus } from '../../../hooks/useGatedSave'
import { useRevalidateOnReturn } from '../../../hooks/useRevalidateOnReturn'
import { getTodos, putTodos } from '../api'
import { canPlaceInToday, moveItem } from '../lib/move'
import { reorder } from '../lib/reorder'
import { rollover, toLocalDateString } from '../lib/rollover'
import { TODAY_LIMIT, type TodoItem, type TodoSectionId, type TodoState } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'

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
// 保存はデバウンス無しの即時 PUT が基本だが、送信は常に直列化1本（in-flight 中の変更は
// 完了後にまとめて再送）し、失敗時は自動リトライしない（次の操作が再アームする）。
export const TodoProvider = ({ children }: { children: ReactNode }) => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()

  const [todoState, setTodoState] = useState<TodoState>(EMPTY_STATE)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  // stale closure 対策（保存判定・rollover が常に最新値を読めるようにする）。
  const todoStateRef = useRef(todoState)
  todoStateRef.current = todoState
  // タブ復帰（revalidate）の発火ごとに進める通し番号。応答到着時にこの値と一致しなければ
  // （後から発火した別の revalidate に追い越されていたら）古い応答として破棄する。
  const revalidateGenerationRef = useRef(0)

  const {
    saveStatus,
    saveError,
    hasPendingChanges,
    markSynced,
  } = useGatedSave<TodoState>({
    state: todoState,
    stateRef: todoStateRef,
    ready: loadStatus === 'ready',
    save: putTodos,
    onError: (message) => showAlert('error', message),
  })

  const loadTodos = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const state = await getTodos()
      setTodoState(state)
      // 読み込み直後の空撃ち保存を防ぐため送信済み扱いにする。
      markSynced(state)
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [markSynced])

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

  // タブに戻ったときの再取得。未保存の変更（in-flight・保存待ちタイマー・送信済みと不一致）が
  // あれば何もしない。取得結果に初回読み込みと同じ経路で rollover を適用し、現在の state と
  // 等価なら何もしない。異なる場合は state を差し替える：rollover 自体が変化を生んでいなければ
  // 「取得しただけ」なので markSynced も揃えて PUT を発火させず、rollover が変化を生んだ場合は
  // 初回読み込みと同様に通常どおり保存させる（markSynced は呼ばない）。
  const revalidate = useCallback(() => {
    if (loadStatus !== 'ready') return
    if (hasPendingChanges()) return
    revalidateGenerationRef.current += 1
    const generation = revalidateGenerationRef.current
    const snapshotBefore = todoStateRef.current

    getTodos()
      .then((fetched) => {
        // 取得中に編集が始まっていたら破棄する。
        if (hasPendingChanges()) return
        // 後から発火した別の revalidate に追い越されていたら（この応答は古い）破棄する。
        if (revalidateGenerationRef.current !== generation) return
        // 世代が最新でも、GET が in-flight の間に編集して保存まで完了していたら
        // hasPendingChanges() は false に戻る。古いスナップショットで保存済みの変更を
        // 巻き戻さないよう、state の参照が変わっていた場合も破棄する。
        if (todoStateRef.current !== snapshotBefore) return
        const rolled = rollover(fetched, toLocalDateString(new Date()))
        if (JSON.stringify(rolled) === JSON.stringify(todoStateRef.current)) return
        setTodoState(rolled)
        if (rolled === fetched) markSynced(rolled)
      })
      .catch(() => {})
  }, [loadStatus, hasPendingChanges, markSynced])

  useRevalidateOnReturn(revalidate)

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
