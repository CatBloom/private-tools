import { describe, expect, it } from 'vitest'
import type { LedgerEntry, LedgerState } from '../shared/types'
import { resolveMonthEntries } from './initMonth'

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  name: '家賃',
  amount: 80000,
  variable: false,
  carryOver: true,
  ...overrides,
})

describe('resolveMonthEntries', () => {
  it('returns a stored month as-is', () => {
    const state: LedgerState = { months: { 202609: [entry()] } }
    const result = resolveMonthEntries(state, '202609')
    expect(result).toEqual({ entries: [entry()], source: 'stored' })
  })

  it('returns an empty stored month as-is (does not fall back further)', () => {
    const state: LedgerState = {
      months: { 202608: [entry()], 202609: [] },
    }
    const result = resolveMonthEntries(state, '202609')
    expect(result).toEqual({ entries: [], source: 'stored' })
  })

  it('copies from the most recent prior month when the requested month has no record', () => {
    const state: LedgerState = { months: { 202608: [entry()] } }
    const result = resolveMonthEntries(state, '202609')
    expect(result.source).toBe('derived')
    expect(result.entries).toEqual([entry()])
  })

  it('nulls out the amount of variable entries when copying forward', () => {
    const state: LedgerState = {
      months: { 202608: [entry({ id: 'e2', name: '電気代', amount: 5000, variable: true })] },
    }
    const result = resolveMonthEntries(state, '202609')
    expect(result.entries).toEqual([entry({ id: 'e2', name: '電気代', amount: null, variable: true })])
  })

  it('excludes entries with carryOver: false when copying forward', () => {
    const state: LedgerState = {
      months: {
        202608: [entry(), entry({ id: 'e3', name: '解約したサブスク', carryOver: false })],
      },
    }
    const result = resolveMonthEntries(state, '202609')
    expect(result.entries).toEqual([entry()])
  })

  it('keeps the id when copying forward', () => {
    const state: LedgerState = { months: { 202608: [entry({ id: 'keep-me' })] } }
    const result = resolveMonthEntries(state, '202609')
    expect(result.entries[0].id).toBe('keep-me')
  })

  it('uses the latest recorded month even when there is a gap in between', () => {
    const state: LedgerState = {
      months: {
        202601: [entry({ id: 'old' })],
        202603: [entry({ id: 'latest', name: 'ガス代' })],
        // 202602 は記録なし
      },
    }
    const result = resolveMonthEntries(state, '202605')
    expect(result.source).toBe('derived')
    expect(result.entries).toEqual([entry({ id: 'latest', name: 'ガス代' })])
  })

  it('returns an empty list when there is no prior record', () => {
    const state: LedgerState = { months: {} }
    const result = resolveMonthEntries(state, '202609')
    expect(result).toEqual({ entries: [], source: 'empty' })
  })
})
