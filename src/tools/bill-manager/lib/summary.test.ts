import { describe, expect, it } from 'vitest'
import type { LedgerEntry, LedgerMonth } from '../shared/types'
import { summarizeMonth } from './summary'

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  name: '家賃',
  amount: 80000,
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

describe('summarizeMonth', () => {
  it('sums non-excluded entry amounts into fixedTotal', () => {
    const result = summarizeMonth(
      month({ entries: [entry({ amount: 80000 }), entry({ id: 'e2', amount: 5500, category: 'insurance' })] }),
      null,
    )
    expect(result.fixedTotal).toBe(85500)
  })

  it('excludes entries marked excluded from fixedTotal and missingCount', () => {
    const result = summarizeMonth(
      month({
        entries: [
          entry({ amount: 80000 }),
          entry({ id: 'e2', amount: null, category: 'telecom', excluded: true }),
        ],
      }),
      null,
    )
    expect(result.fixedTotal).toBe(80000)
    expect(result.missingCount).toBe(0)
  })

  it('counts missing (null) amounts on non-excluded entries', () => {
    const result = summarizeMonth(month({ entries: [entry({ amount: null, variable: true })] }), null)
    expect(result.missingCount).toBe(1)
    expect(result.fixedTotal).toBe(0)
  })

  it('sums specials into specialTotal', () => {
    const result = summarizeMonth(
      month({
        specials: [
          { id: 's1', amount: 825, memo: 'メロブ(paidy)' },
          { id: 's2', amount: 83160, memo: '定期代' },
        ],
      }),
      null,
    )
    expect(result.specialTotal).toBe(83985)
  })

  it('treats a missing credit as null and excludes it from expenseTotal', () => {
    const result = summarizeMonth(month({ entries: [entry({ amount: 47000 })] }), null)
    expect(result.credit).toBeNull()
    expect(result.creditMissing).toBe(true)
    expect(result.expenseTotal).toBe(47000)
  })

  it('adds the credit amount into expenseTotal when available', () => {
    const result = summarizeMonth(month({ entries: [entry({ amount: 47000 })] }), 12000)
    expect(result.expenseTotal).toBe(59000)
    expect(result.creditMissing).toBe(false)
  })

  it('sums income and extraIncome', () => {
    const result = summarizeMonth(month({ income: 280000, extraIncome: 50000 }), null)
    expect(result.income).toBe(330000)
    expect(result.incomeMissing).toBe(false)
  })

  it('treats a null income as 0 and flags incomeMissing', () => {
    const result = summarizeMonth(month({ income: null }), null)
    expect(result.income).toBe(0)
    expect(result.incomeMissing).toBe(true)
  })

  it('computes cashRemaining as income minus expenseTotal', () => {
    const result = summarizeMonth(
      month({
        entries: [entry({ amount: 47000 })],
        specials: [{ id: 's1', amount: 1000, memo: '' }],
        income: 280000,
      }),
      12000,
    )
    expect(result.expenseTotal).toBe(60000)
    expect(result.cashRemaining).toBe(220000)
  })

  it('can go negative when expenses exceed income', () => {
    const result = summarizeMonth(month({ entries: [entry({ amount: 300000 })], income: 100000 }), null)
    expect(result.cashRemaining).toBe(-200000)
  })
})
