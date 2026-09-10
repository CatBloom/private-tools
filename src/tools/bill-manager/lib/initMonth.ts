import { createEmptyLedgerMonth, type LedgerMonth, type LedgerState } from '../shared/types'

export type MonthSource = 'stored' | 'derived' | 'empty'

export type ResolvedMonth = {
  month: LedgerMonth
  source: MonthSource
}

// 対象月より前で記録がある最新の月キー（無ければ null）。YYYYMM は零埋め固定長のため辞書順比較で数値順と一致する。
const findLatestPriorMonth = (state: LedgerState, month: string): string | null => {
  const priorKeys = Object.keys(state.months)
    .filter((key) => key < month)
    .sort()
  return priorKeys.at(-1) ?? null
}

/**
 * 支払月の記録を解決する。保存済みならそのまま、無ければ直前の記録月から派生させる：
 * entries は carryOver:false を除外・variable:true は amount を 0 に（excluded はそのまま引き継ぐ）、
 * income はそのまま引き継ぎ、bonus・extraIncome は null、specials は空にする。表示専用の計算で state は書き換えない。
 */
export const resolveMonth = (state: LedgerState, month: string): ResolvedMonth => {
  const stored = state.months[month]
  if (stored) return { month: stored, source: 'stored' }

  const priorMonth = findLatestPriorMonth(state, month)
  if (priorMonth === null) return { month: createEmptyLedgerMonth(), source: 'empty' }

  const prior = state.months[priorMonth]
  const derived: LedgerMonth = {
    entries: prior.entries
      .filter((entry) => entry.carryOver)
      .map((entry) => (entry.variable ? { ...entry, amount: 0 } : entry)),
    income: prior.income,
    bonus: null,
    extraIncome: null,
    specials: [],
  }
  return { month: derived, source: 'derived' }
}
