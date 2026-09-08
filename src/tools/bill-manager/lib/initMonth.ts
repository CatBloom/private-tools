import type { LedgerEntry, LedgerState } from '../shared/types'

export type MonthEntriesSource = 'stored' | 'derived' | 'empty'

export type ResolvedMonthEntries = {
  entries: LedgerEntry[]
  source: MonthEntriesSource
}

// 対象月より前で記録がある最新の月キー（無ければ null）。YYYYMM は零埋め固定長のため辞書順比較で数値順と一致する。
const findLatestPriorMonth = (state: LedgerState, month: string): string | null => {
  const priorKeys = Object.keys(state.months)
    .filter((key) => key < month)
    .sort()
  return priorKeys.at(-1) ?? null
}

/**
 * 支払月の行を解決する。保存済みならそのまま、無ければ直前の記録月からコピーする
 * （variable な行は amount を null に、carryOver:false の行は除外）。表示専用の計算で state は書き換えない。
 */
export const resolveMonthEntries = (state: LedgerState, month: string): ResolvedMonthEntries => {
  const stored = state.months[month]
  if (stored) return { entries: stored, source: 'stored' }

  const priorMonth = findLatestPriorMonth(state, month)
  if (priorMonth === null) return { entries: [], source: 'empty' }

  const derived = state.months[priorMonth]
    .filter((entry) => entry.carryOver)
    .map((entry) => (entry.variable ? { ...entry, amount: null } : entry))
  return { entries: derived, source: 'derived' }
}
