import { ENTRY_CATEGORIES, type EntryCategory, type LedgerState } from '../shared/types'
import { resolveMonth, type MonthSource } from './initMonth'
import { monthsOfYear } from './monthKey'
import { summarizeMonth, type MonthSummary } from './summary'

export type YearGridMonth = {
  month: string
  source: MonthSource
  summary: MonthSummary
  /** summary.expenseTotal のクレカ未取込版。creditMissing の月は null（年間ビューは「—」を表示し、年間合計から除く）。 */
  expenseTotal: number | null
  /** summary.cashRemaining のクレカ未取込版。creditMissing の月は null（年間ビューは「—」を表示し、年間合計から除く）。 */
  cashRemaining: number | null
}

/** カテゴリ集計の1行。amounts は1〜12月に対応する12要素（excluded:false かつ amount≠null の合計。無ければ0）。 */
export type YearGridCategoryRow = {
  category: EntryCategory
  amounts: number[]
  yearTotal: number
}

/** 特殊費用の1行。amounts は月ごとの specials.amount 合計。 */
export type YearGridSpecialRow = {
  amounts: number[]
  yearTotal: number
}

/** クレカ／支出合計／収入／現金残高の年間合計。クレカ未取込の月（summary.creditMissing）は除いて合計する。 */
export type YearGridTotals = {
  credit: number
  expenseTotal: number
  income: number
  cashRemaining: number
}

export type YearGrid = {
  months: YearGridMonth[]
  categoryRows: YearGridCategoryRow[]
  specialRow: YearGridSpecialRow
  totals: YearGridTotals
}

/**
 * 指定年の12か月分を resolveMonth で束ね、カテゴリごとの集計行（ENTRY_CATEGORIES 順、年内に項目が
 * 1つも無いカテゴリは除く）・特殊費用行・月ごとの集計・年間合計を返す。credits は支払月（YYYYMM）→
 * クレカ額（未取込は null／未指定）。月ごとのクレカ未取込は `months[].summary.creditMissing` で分かり、
 * その月は `months[].expenseTotal`／`cashRemaining` が null になる（カテゴリ行・特殊費用行・収入は
 * クレカ未取込の影響を受けない）。
 */
export const buildYearGrid = (state: LedgerState, year: number, credits: Record<string, number | null>): YearGrid => {
  const resolved = monthsOfYear(year).map((key) => {
    const { month, source } = resolveMonth(state, key)
    return { key, month, source }
  })

  const months: YearGridMonth[] = resolved.map(({ key, month, source }) => {
    const summary = summarizeMonth(month, credits[key] ?? null)
    return {
      month: key,
      source,
      summary,
      expenseTotal: summary.creditMissing ? null : summary.expenseTotal,
      cashRemaining: summary.creditMissing ? null : summary.cashRemaining,
    }
  })

  const presentCategories = new Set<EntryCategory>()
  const categoryAmounts = new Map<EntryCategory, number[]>(ENTRY_CATEGORIES.map((category) => [category, Array(12).fill(0)]))

  resolved.forEach(({ month }, monthIndex) => {
    for (const entry of month.entries) {
      presentCategories.add(entry.category)
      if (entry.excluded || entry.amount === null) continue
      categoryAmounts.get(entry.category)![monthIndex] += entry.amount
    }
  })

  const categoryRows: YearGridCategoryRow[] = ENTRY_CATEGORIES.filter((category) => presentCategories.has(category)).map(
    (category) => {
      const amounts = categoryAmounts.get(category)!
      return { category, amounts, yearTotal: amounts.reduce((total, amount) => total + amount, 0) }
    },
  )

  const specialAmounts = resolved.map(({ month }) => month.specials.reduce((total, special) => total + special.amount, 0))
  const specialRow: YearGridSpecialRow = {
    amounts: specialAmounts,
    yearTotal: specialAmounts.reduce((total, amount) => total + amount, 0),
  }

  // クレカ未取込の月はクレカ／支出合計／収入／現金残高の年間合計から除く（月をまたいだ比較を崩さないため）。
  const totals = months
    .filter(({ summary }) => !summary.creditMissing)
    .reduce<YearGridTotals>(
      (acc, { summary }) => ({
        credit: acc.credit + (summary.credit ?? 0),
        expenseTotal: acc.expenseTotal + summary.expenseTotal,
        income: acc.income + summary.income,
        cashRemaining: acc.cashRemaining + summary.cashRemaining,
      }),
      { credit: 0, expenseTotal: 0, income: 0, cashRemaining: 0 },
    )

  return { months, categoryRows, specialRow, totals }
}
