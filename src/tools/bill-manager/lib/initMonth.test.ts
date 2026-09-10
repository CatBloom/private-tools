import { describe, expect, it } from 'vitest'
import { createEmptyLedgerMonth, type LedgerEntry, type LedgerMonth, type LedgerState } from '../shared/types'
import { resolveMonth } from './initMonth'

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
  ...createEmptyLedgerMonth(),
  ...overrides,
})

describe('resolveMonth', () => {
  it('returns a stored month as-is', () => {
    const stored = month({ entries: [entry()], income: 300000 })
    const state: LedgerState = { months: { 202609: stored } }
    expect(resolveMonth(state, '202609')).toEqual({ month: stored, source: 'stored' })
  })

  it('returns an empty stored month as-is (does not fall back further)', () => {
    const state: LedgerState = {
      months: { 202608: month({ entries: [entry()] }), 202609: month() },
    }
    expect(resolveMonth(state, '202609')).toEqual({ month: month(), source: 'stored' })
  })

  it('copies entries from the most recent prior month when the requested month has no record', () => {
    const state: LedgerState = { months: { 202608: month({ entries: [entry()] }) } }
    const result = resolveMonth(state, '202609')
    expect(result.source).toBe('derived')
    expect(result.month.entries).toEqual([entry()])
  })

  it('zeroes out the amount of variable entries when copying forward', () => {
    const state: LedgerState = {
      months: {
        202608: month({
          entries: [entry({ id: 'e2', name: '電気代', category: 'utility', amount: 5000, variable: true })],
        }),
      },
    }
    const result = resolveMonth(state, '202609')
    expect(result.month.entries).toEqual([
      entry({ id: 'e2', name: '電気代', category: 'utility', amount: 0, variable: true }),
    ])
  })

  it('excludes entries with carryOver: false when copying forward', () => {
    const state: LedgerState = {
      months: {
        202608: month({ entries: [entry(), entry({ id: 'e3', name: '解約したサブスク', carryOver: false })] }),
      },
    }
    const result = resolveMonth(state, '202609')
    expect(result.month.entries).toEqual([entry()])
  })

  it('keeps the excluded flag as-is when copying forward', () => {
    const state: LedgerState = {
      months: { 202608: month({ entries: [entry({ id: 'e4', name: '通信費', category: 'telecom', excluded: true })] }) },
    }
    const result = resolveMonth(state, '202609')
    expect(result.month.entries).toEqual([entry({ id: 'e4', name: '通信費', category: 'telecom', excluded: true })])
  })

  it('keeps the id when copying forward', () => {
    const state: LedgerState = { months: { 202608: month({ entries: [entry({ id: 'keep-me' })] }) } }
    const result = resolveMonth(state, '202609')
    expect(result.month.entries[0].id).toBe('keep-me')
  })

  it('carries income forward, resets bonus and extraIncome to null, and clears specials', () => {
    const state: LedgerState = {
      months: {
        202608: month({
          income: 280000,
          bonus: 200000,
          extraIncome: 50000,
          specials: [{ id: 's1', amount: 1000, memo: 'x' }],
        }),
      },
    }
    const result = resolveMonth(state, '202609')
    expect(result.month.income).toBe(280000)
    expect(result.month.bonus).toBeNull()
    expect(result.month.extraIncome).toBeNull()
    expect(result.month.specials).toEqual([])
  })

  it('uses the latest recorded month even when there is a gap in between', () => {
    const state: LedgerState = {
      months: {
        202601: month({ entries: [entry({ id: 'old' })] }),
        202603: month({ entries: [entry({ id: 'latest', name: 'ガス代', category: 'utility' })] }),
        // 202602 は記録なし
      },
    }
    const result = resolveMonth(state, '202605')
    expect(result.source).toBe('derived')
    expect(result.month.entries).toEqual([entry({ id: 'latest', name: 'ガス代', category: 'utility' })])
  })

  it('returns an empty month when there is no prior record', () => {
    const state: LedgerState = { months: {} }
    expect(resolveMonth(state, '202609')).toEqual({ month: createEmptyLedgerMonth(), source: 'empty' })
  })
})
