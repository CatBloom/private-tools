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

// KV の「同一キー1秒1回」制約を守るための書き込み最小間隔。単発編集では影響しない
// （前回書き込みから十分時間が経っていれば delay=0 で即時に送る）。1秒未満に連続編集した
// ときだけ、残り時間ぶんだけ次の書き込みを遅らせる（スペーシング）。
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
// 保存はデバウンス無しの即時 PUT（ユーザー要望「追加・変更時に即保存／時間制にしない」）が
// 基本だが、KV の「同一キー1秒1回」を守るため書き込みは最小間隔でゲートする: 前回の書き込み
// 開始から MIN_WRITE_INTERVAL_MS 未満なら、残り時間だけ setTimeout してから最新状態を
// 取り直して送る。前回の書き込みから十分時間が経っていれば delay=0 で即時に送るので、
// アイドル後の単発編集は体感上「即時保存」のまま。1秒未満の連続編集（バースト）だけが
// スペーシングされ、中間状態は畳まれて最終状態だけが届く。
// これとは別に送信そのものも直列化する: in-flight 中の変更はそのタイミングでは送らず、
// 完了後に最新値との差分があればもう一度だけ（＝上記のゲートを経て）送る
// （in-flight guard + 最新へ集約）。同時実行は常に高々1本。
// 失敗時（ネットワーク/認証等のハード失敗）は自動リトライしない
// （lastSentRef を進めないので、次の操作が再アームする。無限リトライによる書き込み
// クォータの浪費を避けるため）。
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
  // 完了後に最新値との差分を見て必要なら続けて1回だけ送る（ゲートを経て）。
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  // 直前に putTodos を呼び始めた時刻（Date.now()）。書き込み最小間隔のゲートで
  // 「前回の書き込み開始からどれだけ経ったか」を判定するために使う。
  const lastWriteStartedAtRef = useRef<number | null>(null)
  // スペーシングのために張った pending タイマー（高々1本。新たにスケジュールする前や
  // アンマウント時に必ず clear する）。
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // runSave の成功コールバックから最新の scheduleSave を呼ぶための ref。scheduleSave は
  // runSave に依存して定義される（宣言順で後）ため、runSave の useCallback 依存配列に
  // 直接は書けない（TDZ）。ref 経由にすることで循環参照を避けつつ常に最新を呼べるようにする。
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
            // 通信中にさらに変更があった。scheduleSave 経由（＝ゲートを経て）もう一度だけ送る。
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

  // 保存の唯一のエントリポイント。in-flight 中・差分無しなら何もしない。前回の書き込み開始
  // から MIN_WRITE_INTERVAL_MS 経っていなければ、残り時間だけ pending タイマーで遅らせてから
  // （発火時に最新状態・in-flight を再評価して）送る。経っていれば即時に送る。
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

  // アンマウント時に pending タイマーが残らないようにする（発火しても setTodoState 等は
  // 呼ばないため実害は無いが、不要なタイマーは残さない）。
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
