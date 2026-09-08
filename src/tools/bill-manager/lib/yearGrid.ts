import { ENTRY_CATEGORIES, type EntryCategory, type LedgerState } from '../shared/types'
import { resolveMonth, type MonthSource } from './initMonth'
import { monthsOfYear } from './monthKey'
import { summarizeMonth, type MonthSummary } from './summary'

export type YearGridMonth = {
  month: string
  source: MonthSource
  summary: MonthSummary
}

/** 年内に登場した項目を name で束ねた行。amounts は1〜12月に対応する12要素（未登場の月は null）。 */
export type YearGridRow = {
  name: string
  category: EntryCategory
  excluded: boolean
  amounts: (number | null)[]
  yearTotal: number
}

export type YearGridTotals = {
  specialTotal: number
  fixedTotal: number
  credit: number
  expenseTotal: number
  income: number
  cashRemaining: number
}

export type YearGrid = {
  months: YearGridMonth[]
  rows: YearGridRow[]
  totals: YearGridTotals
}

const categoryIndex = (category: EntryCategory): number => ENTRY_CATEGORIES.indexOf(category)

/**
 * 指定年の12か月分を resolveMonth で束ね、項目行（name で束ねカテゴリ順）と月ごとの集計、
 * 年間合計を返す。credits は支払月（YYYYMM）→ クレカ額（未取込は null／未指定）。
 */
export const buildYearGrid = (state: LedgerState, year: number, credits: Record<string, number | null>): YearGrid => {
  const resolved = monthsOfYear(year).map((key) => {
    const { month, source } = resolveMonth(state, key)
    return { key, month, source }
  })

  const months: YearGridMonth[] = resolved.map(({ key, month, source }) => ({
    month: key,
    source,
    summary: summarizeMonth(month, credits[key] ?? null),
  }))

  const rowMap = new Map<string, YearGridRow>()
  resolved.forEach(({ month }, monthIndex) => {
    for (const entry of month.entries) {
      let row = rowMap.get(entry.name)
      if (!row) {
        row = { name: entry.name, category: entry.category, excluded: entry.excluded, amounts: Array(12).fill(null), yearTotal: 0 }
        rowMap.set(entry.name, row)
      }
      // 年内で category / excluded が変わった場合は最新（月が進んだ方）の値を行の表示に使う。
      row.category = entry.category
      row.excluded = entry.excluded
      row.amounts[monthIndex] = entry.amount
      if (!entry.excluded && entry.amount !== null) row.yearTotal += entry.amount
    }
  })

  const rows = Array.from(rowMap.values()).sort((a, b) => categoryIndex(a.category) - categoryIndex(b.category))

  const totals = months.reduce<YearGridTotals>(
    (acc, { summary }) => ({
      specialTotal: acc.specialTotal + summary.specialTotal,
      fixedTotal: acc.fixedTotal + summary.fixedTotal,
      credit: acc.credit + (summary.credit ?? 0),
      expenseTotal: acc.expenseTotal + summary.expenseTotal,
      income: acc.income + summary.income,
      cashRemaining: acc.cashRemaining + summary.cashRemaining,
    }),
    { specialTotal: 0, fixedTotal: 0, credit: 0, expenseTotal: 0, income: 0, cashRemaining: 0 },
  )

  return { months, rows, totals }
}
