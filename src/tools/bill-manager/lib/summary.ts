import type { LedgerMonth } from '../shared/types'

export type MonthSummary = {
  /** excluded:false かつ amount≠null の entries の合計。 */
  fixedTotal: number
  /** specials.amount の合計。 */
  specialTotal: number
  /** CSV 合計、未取込は null。 */
  credit: number | null
  /** fixedTotal + specialTotal + (credit ?? 0)。 */
  expenseTotal: number
  /** (income ?? 0) + (bonus ?? 0) + (extraIncome ?? 0)。 */
  income: number
  /** income − expenseTotal。 */
  cashRemaining: number
  /** excluded:false の entries のうち amount が未入力の件数。 */
  missingCount: number
  creditMissing: boolean
  incomeMissing: boolean
}

export const summarizeMonth = (month: LedgerMonth, credit: number | null): MonthSummary => {
  let fixedTotal = 0
  let missingCount = 0
  for (const entry of month.entries) {
    if (entry.excluded) continue
    if (entry.amount === null) {
      missingCount += 1
      continue
    }
    fixedTotal += entry.amount
  }

  const specialTotal = month.specials.reduce((total, special) => total + special.amount, 0)
  const expenseTotal = fixedTotal + specialTotal + (credit ?? 0)
  const income = (month.income ?? 0) + (month.bonus ?? 0) + (month.extraIncome ?? 0)
  const cashRemaining = income - expenseTotal

  return {
    fixedTotal,
    specialTotal,
    credit,
    expenseTotal,
    income,
    cashRemaining,
    missingCount,
    creditMissing: credit === null,
    incomeMissing: month.income === null,
  }
}
