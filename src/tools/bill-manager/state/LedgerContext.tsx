import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAlert } from '../../../components/feedback'
import { getLedger, putLedger } from '../api'
import { resolveMonthEntries, type MonthEntriesSource } from '../lib/initMonth'
import { currentMonthKey, shiftMonth } from '../lib/monthKey'
import {
  createEmptyLedgerState,
  MAX_ENTRIES_PER_MONTH,
  type LedgerEntry,
  type LedgerState,
} from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// KV の「同一キー1秒1回」制約を守るための書き込み最小間隔（TodoContext と同じゲート）。
const MIN_WRITE_INTERVAL_MS = 1000

const createEntry = (name: string, amount: number | null, variable: boolean): LedgerEntry => ({
  id: crypto.randomUUID(),
  name: name.trim(),
  amount,
  variable,
  carryOver: true,
})

export type AddEntryInput = {
  name: string
  amount: number | null
  variable: boolean
}

type LedgerContextValue = {
  state: LedgerState
  loadStatus: LoadStatus
  loadError: string | null
  reload: () => void
  saveStatus: SaveStatus
  saveError: string | null
  month: string
  setMonth: (month: string) => void
  goPrevMonth: () => void
  goNextMonth: () => void
  entries: LedgerEntry[]
  entriesSource: MonthEntriesSource
  addEntry: (input: AddEntryInput) => boolean
  updateEntry: (id: string, patch: Partial<Omit<LedgerEntry, 'id'>>) => void
  removeEntry: (id: string) => void
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

// 支払月ごとの固定費スナップショットを1箇所に持ち上げ、ページを切り替えても保持する。保存は
// TodoContext と同じ「変更ごと即時 PUT＋1秒ゲート＋in-flight 直列化・失敗時は自動リトライしない」。
export const LedgerProvider = ({ children }: { children: ReactNode }) => {
  const { showAlert } = useAlert()

  const [state, setState] = useState<LedgerState>(createEmptyLedgerState())
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [month, setMonth] = useState<string>(() => currentMonthKey())

  // stale closure 対策（保存判定が常に最新値を読めるようにする）。
  const stateRef = useRef(state)
  stateRef.current = state
  // 直近で putLedger に成功したスナップショット参照。同一参照なら差分無しとみなす（失敗時は更新しない）。
  const lastSentRef = useRef<LedgerState | null>(null)
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  const lastWriteStartedAtRef = useRef<number | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // scheduleSave は runSave より後に定義されるため useCallback の依存配列に直接書けない（TDZ）。ref 経由で呼ぶ。
  const scheduleSaveRef = useRef<() => void>(() => {})

  const runSave = useCallback(
    (snapshot: LedgerState) => {
      setSaveStatus('saving')
      setSaveError(null)
      lastWriteStartedAtRef.current = Date.now()
      const request = putLedger(snapshot)
      inFlightRef.current = request
      request.then(
        () => {
          lastSentRef.current = snapshot
          inFlightRef.current = null
          if (stateRef.current !== snapshot) {
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
    const snapshot = stateRef.current
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

  const loadLedger = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const loaded = await getLedger()
      setState(loaded)
      // 読み込み直後の空撃ち保存を防ぐため送信済み扱いにする。
      lastSentRef.current = loaded
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  useEffect(() => {
    if (loadStatus !== 'ready') return
    scheduleSave()
  }, [state, loadStatus, scheduleSave])

  // 表示のための初期化（記録が無い月のコピー）はここでのみ計算する。state には書き込まない。
  const { entries, source: entriesSource } = useMemo(() => resolveMonthEntries(state, month), [state, month])

  const addEntry = useCallback(
    (input: AddEntryInput): boolean => {
      const trimmed = input.name.trim()
      if (!trimmed || loadStatus !== 'ready') return false

      let added = false
      setState((current) => {
        const baseEntries = current.months[month] ?? entries
        if (baseEntries.length >= MAX_ENTRIES_PER_MONTH) return current
        added = true
        const nextEntries = [...baseEntries, createEntry(trimmed, input.amount, input.variable)]
        return { ...current, months: { ...current.months, [month]: nextEntries } }
      })
      return added
    },
    [month, entries, loadStatus],
  )

  // derived/empty な月に初めて変更が入った時点で state に書き込む（materialize）。
  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<LedgerEntry, 'id'>>) => {
      setState((current) => {
        const baseEntries = current.months[month] ?? entries
        const nextEntries = baseEntries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
        return { ...current, months: { ...current.months, [month]: nextEntries } }
      })
    },
    [month, entries],
  )

  const removeEntry = useCallback(
    (id: string) => {
      setState((current) => {
        const baseEntries = current.months[month] ?? entries
        const nextEntries = baseEntries.filter((entry) => entry.id !== id)
        return { ...current, months: { ...current.months, [month]: nextEntries } }
      })
    },
    [month, entries],
  )

  const goPrevMonth = useCallback(() => setMonth((current) => shiftMonth(current, -1)), [])
  const goNextMonth = useCallback(() => setMonth((current) => shiftMonth(current, 1)), [])

  const value: LedgerContextValue = {
    state,
    loadStatus,
    loadError,
    reload: loadLedger,
    saveStatus,
    saveError,
    month,
    setMonth,
    goPrevMonth,
    goNextMonth,
    entries,
    entriesSource,
    addEntry,
    updateEntry,
    removeEntry,
  }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export const useLedger = (): LedgerContextValue => {
  const context = useContext(LedgerContext)
  if (!context) {
    throw new Error('useLedger must be used within a LedgerProvider')
  }
  return context
}
