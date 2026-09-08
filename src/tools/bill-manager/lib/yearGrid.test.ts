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
  extraIncome: null,
  specials: [],
  ...overrides,
})

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

  it('groups entries into rows by name, ordered by category', () => {
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
    expect(grid.rows.map((row) => row.name)).toEqual(['家賃', '電気代'])
  })

  it('carries each row amount across derived months and sums into yearTotal', () => {
    const state: LedgerState = {
      months: {
        202601: month({ entries: [entry({ amount: 47000 })] }),
        202606: month({ entries: [entry({ amount: 76000 })] }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    const row = grid.rows[0]

    expect(row.amounts[0]).toBe(47000) // 1月: 記録あり
    expect(row.amounts[4]).toBe(47000) // 5月: 1月からの派生
    expect(row.amounts[5]).toBe(76000) // 6月: 記録あり
    expect(row.amounts[11]).toBe(76000) // 12月: 6月からの派生
    expect(row.yearTotal).toBe(47000 * 5 + 76000 * 7)
  })

  it('excludes amounts from yearTotal for entries marked excluded', () => {
    const state: LedgerState = {
      months: {
        202601: month({ entries: [entry({ name: '通信費', category: 'telecom', amount: 7700, excluded: true })] }),
      },
    }
    const grid = buildYearGrid(state, 2026, {})
    expect(grid.rows[0].excluded).toBe(true)
    expect(grid.rows[0].yearTotal).toBe(0)
  })

  it('sums each month summary into year totals', () => {
    const state: LedgerState = {
      months: { 202601: month({ entries: [entry({ amount: 47000 })], income: 280000 }) },
    }
    const grid = buildYearGrid(state, 2026, { 202601: 12000 })

    expect(grid.totals.fixedTotal).toBe(47000 * 12)
    expect(grid.totals.income).toBe(280000 * 12)
    // credits に無い月は null（0扱い）なので1月分の12000だけが積み上がる。
    expect(grid.totals.credit).toBe(12000)
  })

  it('treats a month missing from credits as 未取込 (null) in that month summary', () => {
    const state: LedgerState = { months: { 202601: month() } }
    const grid = buildYearGrid(state, 2026, {})
    expect(grid.months[0].summary.credit).toBeNull()
  })
})
