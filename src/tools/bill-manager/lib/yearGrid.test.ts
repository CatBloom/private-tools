import { describe, expect, it } from 'vitest'
import type { LedgerEntry, LedgerMonth, LedgerState } from '../shared/types'
import { buildYearGrid } from './yearGrid'

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  name: '家賃',
  amount: 47000,
  category: 'rent',
  variable: false,
  carryOver: true,
  excluded: false,
  ...overrides,
})

const month = (overrides: Partial<LedgerMonth> = {}): LedgerMonth => ({
  entries: [],
  income: null,
  bonus: null,
  extraIncome: null,
  specials: [],
  ...overrides,
})

// 2026年の全12か月に同じクレカ額を割り当てる（未取込月が無い状態を作る）。
const allMonthsCredits = (amount: number): Record<string, number> =>
  Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2026${String(i + 1).padStart(2, '0')}`, amount]))

describe('buildYearGrid', () => {
  it('returns 12 month columns in order, each with its resolved source', () => {
    const state: LedgerState = { months: { 202601: month({ entries: [entry()] }) } }
    const grid = buildYearGrid(state, 2026, {})

    expect(grid.months.map((m) => m.month)).toEqual([
      '202601',
      '202602',
      '202603',
      '202604',
      '202605',
      '202606',
      '202607',
      '202608',
      '202609',
      '202610',
      '202611',
      '202612',
    ])
    expect(grid.months[0].source).toBe('stored')
    expect(grid.months[1].source).toBe('derived')
  })

  it('groups entries into category rows ordered by ENTRY_CATEGORIES', () => {
    const state: LedgerState = {
      months: {
        202601: month({
          entries: [
            entry({ id: 'u1', name: '電気代', category: 'utility', amount: 6000 }),
            entry({ id: 'r1', name: '家賃', category: 'rent', amount: 47000 }),
          ],
        }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    expect(grid.categoryRows.map((row) => row.category)).toEqual(['rent', 'utility'])
  })

  it('sums multiple entries of the same category within a month', () => {
    const state: LedgerState = {
      months: {
        202601: month({
          entries: [
            entry({ id: 'r1', name: '家賃', category: 'rent', amount: 47000 }),
            entry({ id: 'r2', name: '駐車場', category: 'rent', amount: 8000 }),
          ],
        }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    const row = grid.categoryRows.find((r) => r.category === 'rent')!
    expect(row.amounts[0]).toBe(55000)
  })

  it('carries category amounts across derived months and sums into yearTotal', () => {
    const state: LedgerState = {
      months: {
        202601: month({ entries: [entry({ amount: 47000 })] }),
        202606: month({ entries: [entry({ amount: 76000 })] }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    const row = grid.categoryRows.find((r) => r.category === 'rent')!

    expect(row.amounts[0]).toBe(47000) // 1月: 記録あり
    expect(row.amounts[4]).toBe(47000) // 5月: 1月からの派生
    expect(row.amounts[5]).toBe(76000) // 6月: 記録あり
    expect(row.amounts[11]).toBe(76000) // 12月: 6月からの派生
    expect(row.yearTotal).toBe(47000 * 5 + 76000 * 7)
  })

  it('excludes excluded entries from the category amount but still shows the category row (as 0)', () => {
    const state: LedgerState = {
      months: {
        202601: month({ entries: [entry({ name: '通信費', category: 'telecom', amount: 7700, excluded: true })] }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    const row = grid.categoryRows.find((r) => r.category === 'telecom')!
    expect(row).toBeDefined()
    expect(row.amounts.every((amount) => amount === 0)).toBe(true)
    expect(row.yearTotal).toBe(0)
  })

  it('omits a category row when no entry of that category appears in any of the 12 months', () => {
    const state: LedgerState = { months: { 202601: month({ entries: [entry({ category: 'rent' })] }) } }
    const grid = buildYearGrid(state, 2026, {})
    expect(grid.categoryRows.some((row) => row.category === 'insurance')).toBe(false)
  })

  it('includes a category present only in a derived month', () => {
    const state: LedgerState = {
      months: { 202601: month({ entries: [entry({ category: 'insurance', amount: 5500 })] }) },
    }
    const grid = buildYearGrid(state, 2026, {})
    const row = grid.categoryRows.find((r) => r.category === 'insurance')!
    expect(row).toBeDefined()
    expect(row.amounts[5]).toBe(5500) // 6月: 1月からの派生
  })

  it('sums specials per month into the special row and yearTotal', () => {
    const state: LedgerState = {
      months: {
        202601: month({ specials: [{ id: 's1', amount: 825, memo: 'メロブ' }] }),
        202602: month({ specials: [{ id: 's2', amount: 83160, memo: '定期代' }] }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    expect(grid.specialRow.amounts[0]).toBe(825)
    expect(grid.specialRow.amounts[1]).toBe(83160)
    expect(grid.specialRow.amounts[2]).toBe(0) // specials は翌月へコピーしない
    expect(grid.specialRow.yearTotal).toBe(825 + 83160)
  })

  it('sums each month summary into year totals when every month has a credit amount', () => {
    const state: LedgerState = {
      months: { 202601: month({ entries: [entry({ amount: 47000 })], income: 280000 }) },
    }
    const grid = buildYearGrid(state, 2026, allMonthsCredits(12000))

    expect(grid.totals.income).toBe(280000 * 12)
    expect(grid.totals.credit).toBe(12000 * 12)
    expect(grid.totals.expenseTotal).toBe(grid.months.reduce((total, m) => total + m.summary.expenseTotal, 0))
  })

  it('computes cashRemaining totals as income - expenseTotal', () => {
    const state: LedgerState = {
      months: { 202601: month({ entries: [entry({ amount: 47000 })], income: 280000 }) },
    }
    const grid = buildYearGrid(state, 2026, allMonthsCredits(12000))
    expect(grid.totals.cashRemaining).toBe(grid.totals.income - grid.totals.expenseTotal)
  })

  it('treats a month missing from credits as 未取込 (null) in that month summary', () => {
    const state: LedgerState = { months: { 202601: month() } }
    const grid = buildYearGrid(state, 2026, {})
    expect(grid.months[0].summary.credit).toBeNull()
  })

  it('nulls out expenseTotal/cashRemaining for a month with 未取込 credit', () => {
    const state: LedgerState = { months: { 202601: month({ income: 280000 }) } }
    const grid = buildYearGrid(state, 2026, {})

    expect(grid.months[0].summary.creditMissing).toBe(true)
    expect(grid.months[0].expenseTotal).toBeNull()
    expect(grid.months[0].cashRemaining).toBeNull()
  })

  it('excludes 未取込 months from the credit/expenseTotal/income/cashRemaining year totals', () => {
    const state: LedgerState = {
      months: {
        202601: month({ income: 280000 }),
        202602: month({ income: 300000 }),
      },
    }
    // 202601 のみクレカを取込済み。202602 以降（派生月含む）は全て未取込のまま。
    const grid = buildYearGrid(state, 2026, { 202601: 10000 })
    const januarySummary = grid.months[0].summary

    expect(grid.months.slice(1).every((m) => m.summary.creditMissing)).toBe(true)
    expect(grid.totals.credit).toBe(januarySummary.credit)
    expect(grid.totals.income).toBe(januarySummary.income)
    expect(grid.totals.expenseTotal).toBe(januarySummary.expenseTotal)
    expect(grid.totals.cashRemaining).toBe(januarySummary.cashRemaining)
  })

  it('keeps category rows and the special row unaffected by 未取込 months', () => {
    const state: LedgerState = {
      months: {
        202601: month({ entries: [entry({ amount: 47000 })], specials: [{ id: 's1', amount: 1000, memo: '' }] }),
      },
    }
    const grid = buildYearGrid(state, 2026, {}) // クレカは全月未取込
    const row = grid.categoryRows.find((r) => r.category === 'rent')!

    expect(row.yearTotal).toBe(47000 * 12) // 派生月にも通常どおり引き継がれる
    expect(grid.specialRow.yearTotal).toBe(1000)
  })
})
