import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAlert } from '../../../components/feedback'
import { useGatedSave, type SaveStatus } from '../../../hooks/useGatedSave'
import { useRevalidateOnReturn } from '../../../hooks/useRevalidateOnReturn'
import { getLedger, putLedger } from '../api'
import { fetchCreditCsvBytes } from '../creditCsvApi'
import { creditUsageMonth, sumCreditCsv } from '../lib/creditAmount'
import { resolveMonth, type MonthSource } from '../lib/initMonth'
import { currentMonthKey, monthsOfYear, yearOf } from '../lib/monthKey'
import {
  createEmptyLedgerState,
  MAX_ENTRIES_PER_MONTH,
  MAX_SPECIALS_PER_MONTH,
  type EntryCategory,
  type LedgerEntry,
  type LedgerMonth,
  type LedgerState,
  type SpecialExpense,
} from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'

const createEntry = (name: string, amount: number | null, category: EntryCategory, variable: boolean): LedgerEntry => ({
  id: crypto.randomUUID(),
  name: name.trim(),
  amount,
  category,
  variable,
  carryOver: true,
  excluded: false,
})

// derived/empty な月に初めて変更が入った時点で state に書き込む（materialize）ための基点。
const materializeMonth = (state: LedgerState, month: string): LedgerMonth =>
  state.months[month] ?? resolveMonth(state, month).month

export type AddEntryInput = {
  name: string
  amount: number | null
  category: EntryCategory
  variable: boolean
}

export type AddSpecialInput = {
  amount: number
  memo: string
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
  currentMonth: LedgerMonth
  currentMonthSource: MonthSource

  year: number
  setYear: (year: number) => void

  // 支払月（YYYYMM）→ クレカ額。未取得は undefined、未取込は null。credit-csv から取得のたびにキャッシュする。
  creditByMonth: Record<string, number | null | undefined>

  addEntry: (input: AddEntryInput) => boolean
  updateEntry: (id: string, patch: Partial<Omit<LedgerEntry, 'id'>>) => void
  removeEntry: (id: string) => void

  setIncome: (month: string, value: number | null) => void
  setBonus: (month: string, value: number | null) => void
  setExtraIncome: (month: string, value: number | null) => void
  addSpecial: (month: string, input: AddSpecialInput) => boolean
  updateSpecial: (month: string, id: string, patch: Partial<Omit<SpecialExpense, 'id'>>) => void
  removeSpecial: (month: string, id: string) => void
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

// 支払月ごとのスナップショットを1箇所に持ち上げ、ページを切り替えても保持する。保存は
// TodoContext と同じ「変更ごと即時 PUT＋1秒ゲート＋in-flight 直列化・失敗時は自動リトライしない」。
export const LedgerProvider = ({ children }: { children: ReactNode }) => {
  const { showAlert } = useAlert()

  const [state, setState] = useState<LedgerState>(createEmptyLedgerState())
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [month, setMonthState] = useState<string>(() => currentMonthKey())
  const [year, setYear] = useState<number>(() => yearOf(currentMonthKey()))
  const [creditByMonth, setCreditByMonth] = useState<Record<string, number | null | undefined>>({})

  // stale closure 対策（保存判定が常に最新値を読めるようにする）。
  const stateRef = useRef(state)
  stateRef.current = state
  // 支払月ごとの「クレカ額の要求世代」。単調増加の通し番号で、要求が失敗しても削除しない
  // （削除すると次の要求が若い番号から再開し、まだ in-flight の古い要求と世代が一致してしまうため）。
  // 応答到着時にこの Map の値が発行時の世代と一致しなければ、追い越されている（新しい要求が別に
  // 走っている）ので古い応答は破棄する。
  const creditGenerationRef = useRef<Map<string, number>>(new Map())
  // 支払月ごとの「要求済み（in-flight または取得済み）」フラグ。ensureCredit の二重フェッチ防止に
  // 使う（世代とは別軸）。失敗時はここから外して再フェッチできるようにする。
  const creditRequestedRef = useRef<Set<string>>(new Set())
  // タブ復帰（revalidate）の発火ごとに進める通し番号。応答到着時にこの値と一致しなければ
  // （後から発火した別の revalidate に追い越されていたら）古い応答として破棄する。
  const revalidateGenerationRef = useRef(0)

  const {
    saveStatus,
    saveError,
    hasPendingChanges,
    markSynced,
  } = useGatedSave<LedgerState>({
    state,
    stateRef,
    ready: loadStatus === 'ready',
    save: putLedger,
    onError: (message) => showAlert('error', message),
  })

  const loadLedger = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const loaded = await getLedger()
      setState(loaded)
      // 読み込み直後の空撃ち保存を防ぐため送信済み扱いにする。
      markSynced(loaded)
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [markSynced])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  // 月ビューでの月移動（202512→202601 等）や /month/:month の直接オープン後に年間タブへ戻ると
  // 選択中の年が古いままになるため、選択月が変わったら年も追従させる。/year/:year で明示された
  // 年（YearPage が setYear を直接呼ぶ）はこの同期の対象外で、従来どおり優先される。
  const setMonth = useCallback((nextMonth: string) => {
    setMonthState(nextMonth)
    setYear(yearOf(nextMonth))
  }, [])

  // クレカ額は KV に保存せず、支払月ごとに毎回 credit-csv の CSV から算出してキャッシュする。
  // generation は要求発行のたびに進める通し番号。応答到着時に Map の現在値と一致する（＝追い越されて
  // いない）ときだけ state に反映する。
  const fetchCredit = useCallback(
    (paymentMonth: string, generation: number) => {
      const usageMonth = creditUsageMonth(paymentMonth)

      fetchCreditCsvBytes(usageMonth)
        .then((bytes) => {
          if (creditGenerationRef.current.get(paymentMonth) !== generation) return
          const amount = bytes === null ? null : sumCreditCsv(`${usageMonth}.csv`, bytes)
          setCreditByMonth((current) => ({ ...current, [paymentMonth]: amount }))
        })
        .catch((error: unknown) => {
          // 世代が最新でない（追い越された）要求の失敗は、通知も要求済み解除もせず黙って破棄する。
          if (creditGenerationRef.current.get(paymentMonth) !== generation) return
          // 失敗時は再フェッチできるよう要求済み扱いを外す（世代は据え置き、自動リトライはしない）。
          creditRequestedRef.current.delete(paymentMonth)
          showAlert('error', error instanceof Error ? error.message : 'クレカ明細の取得に失敗しました。')
        })
    },
    [showAlert],
  )

  // 未要求（または前回失敗で要求済み扱いが外れた）の月だけ取得する（初回表示用）。
  const ensureCredit = useCallback(
    (paymentMonth: string) => {
      if (creditRequestedRef.current.has(paymentMonth)) return
      creditRequestedRef.current.add(paymentMonth)
      const generation = (creditGenerationRef.current.get(paymentMonth) ?? 0) + 1
      creditGenerationRef.current.set(paymentMonth, generation)
      fetchCredit(paymentMonth, generation)
    },
    [fetchCredit],
  )

  // 既に要求済み（in-flight・取得済みいずれも）でも世代を進めて強制的に再取得する（タブ復帰用）。
  // 先行する要求は世代が古くなるため、後から解決しても破棄される。
  const refreshCredit = useCallback(
    (paymentMonth: string) => {
      creditRequestedRef.current.add(paymentMonth)
      const generation = (creditGenerationRef.current.get(paymentMonth) ?? 0) + 1
      creditGenerationRef.current.set(paymentMonth, generation)
      fetchCredit(paymentMonth, generation)
    },
    [fetchCredit],
  )

  // タブに戻ったときの再取得。ledger は未保存の変更（in-flight・保存待ちタイマー・送信済みと
  // 不一致）があれば何もしない。取得結果が現在と等価なら何もせず、異なれば state を差し替えつつ
  // markSynced も同じ値に揃えて、差し替え自体が PUT を発火させないようにする。クレカ額は別タブでの
  // 取込を拾うため、ledger の未保存変更の有無に関わらず選択中の月・年の分を再取得する（取得済みの
  // 値は新しい結果が届くまで保持し、一瞬「未取込」に戻さない）。
  const revalidate = useCallback(() => {
    if (loadStatus !== 'ready') return

    for (const key of new Set([month, ...monthsOfYear(year)])) {
      refreshCredit(key)
    }

    if (hasPendingChanges()) return
    revalidateGenerationRef.current += 1
    const generation = revalidateGenerationRef.current
    const snapshotBefore = stateRef.current

    getLedger()
      .then((fetched) => {
        // 取得中に編集が始まっていたら破棄する。
        if (hasPendingChanges()) return
        // 後から発火した別の revalidate に追い越されていたら（この応答は古い）破棄する。
        if (revalidateGenerationRef.current !== generation) return
        // 世代が最新でも、GET が in-flight の間に編集して保存まで完了していたら hasPendingChanges()
        // は false に戻る。古いスナップショットで保存済みの変更を巻き戻さないよう、state の参照が
        // 変わっていた場合も破棄する。
        if (stateRef.current !== snapshotBefore) return
        if (JSON.stringify(fetched) === JSON.stringify(stateRef.current)) return
        setState(fetched)
        markSynced(fetched)
      })
      .catch(() => {})
  }, [loadStatus, hasPendingChanges, markSynced, month, year, refreshCredit])

  useRevalidateOnReturn(revalidate)

  // 表示のための初期化（記録が無い月の派生）はここでのみ計算する。state には書き込まない。
  const { month: currentMonth, source: currentMonthSource } = useMemo(() => resolveMonth(state, month), [state, month])

  useEffect(() => {
    ensureCredit(month)
  }, [month, ensureCredit])

  useEffect(() => {
    for (const key of monthsOfYear(year)) ensureCredit(key)
  }, [year, ensureCredit])

  const addEntry = useCallback(
    (input: AddEntryInput): boolean => {
      const trimmed = input.name.trim()
      if (!trimmed || loadStatus !== 'ready') return false

      let added = false
      setState((current) => {
        const base = materializeMonth(current, month)
        if (base.entries.length >= MAX_ENTRIES_PER_MONTH) return current
        added = true
        const nextMonth: LedgerMonth = {
          ...base,
          entries: [...base.entries, createEntry(trimmed, input.amount, input.category, input.variable)],
        }
        return { ...current, months: { ...current.months, [month]: nextMonth } }
      })
      return added
    },
    [month, loadStatus],
  )

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<LedgerEntry, 'id'>>) => {
      setState((current) => {
        const base = materializeMonth(current, month)
        const nextMonth: LedgerMonth = {
          ...base,
          entries: base.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
        }
        return { ...current, months: { ...current.months, [month]: nextMonth } }
      })
    },
    [month],
  )

  const removeEntry = useCallback(
    (id: string) => {
      setState((current) => {
        const base = materializeMonth(current, month)
        const nextMonth: LedgerMonth = { ...base, entries: base.entries.filter((entry) => entry.id !== id) }
        return { ...current, months: { ...current.months, [month]: nextMonth } }
      })
    },
    [month],
  )

  const setIncome = useCallback((targetMonth: string, value: number | null) => {
    setState((current) => {
      const base = materializeMonth(current, targetMonth)
      return { ...current, months: { ...current.months, [targetMonth]: { ...base, income: value } } }
    })
  }, [])

  const setBonus = useCallback((targetMonth: string, value: number | null) => {
    setState((current) => {
      const base = materializeMonth(current, targetMonth)
      return { ...current, months: { ...current.months, [targetMonth]: { ...base, bonus: value } } }
    })
  }, [])

  const setExtraIncome = useCallback((targetMonth: string, value: number | null) => {
    setState((current) => {
      const base = materializeMonth(current, targetMonth)
      return { ...current, months: { ...current.months, [targetMonth]: { ...base, extraIncome: value } } }
    })
  }, [])

  const addSpecial = useCallback(
    (targetMonth: string, input: AddSpecialInput): boolean => {
      if (loadStatus !== 'ready') return false

      let added = false
      setState((current) => {
        const base = materializeMonth(current, targetMonth)
        if (base.specials.length >= MAX_SPECIALS_PER_MONTH) return current
        added = true
        const special: SpecialExpense = { id: crypto.randomUUID(), amount: input.amount, memo: input.memo.trim() }
        const nextMonth: LedgerMonth = { ...base, specials: [...base.specials, special] }
        return { ...current, months: { ...current.months, [targetMonth]: nextMonth } }
      })
      return added
    },
    [loadStatus],
  )

  const updateSpecial = useCallback((targetMonth: string, id: string, patch: Partial<Omit<SpecialExpense, 'id'>>) => {
    setState((current) => {
      const base = materializeMonth(current, targetMonth)
      const nextMonth: LedgerMonth = {
        ...base,
        specials: base.specials.map((special) => (special.id === id ? { ...special, ...patch } : special)),
      }
      return { ...current, months: { ...current.months, [targetMonth]: nextMonth } }
    })
  }, [])

  const removeSpecial = useCallback((targetMonth: string, id: string) => {
    setState((current) => {
      const base = materializeMonth(current, targetMonth)
      const nextMonth: LedgerMonth = { ...base, specials: base.specials.filter((special) => special.id !== id) }
      return { ...current, months: { ...current.months, [targetMonth]: nextMonth } }
    })
  }, [])

  const value: LedgerContextValue = {
    state,
    loadStatus,
    loadError,
    reload: loadLedger,
    saveStatus,
    saveError,
    month,
    setMonth,
    currentMonth,
    currentMonthSource,
    year,
    setYear,
    creditByMonth,
    addEntry,
    updateEntry,
    removeEntry,
    setIncome,
    setBonus,
    setExtraIncome,
    addSpecial,
    updateSpecial,
    removeSpecial,
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
