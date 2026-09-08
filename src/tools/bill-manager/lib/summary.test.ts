import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '../shared/types'
import { summarizeEntries } from './summary'

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  name: '家賃',
  amount: 80000,
  variable: false,
  carryOver: true,
  ...overrides,
})

describe('summarizeEntries', () => {
  it('sums the amounts of all entries', () => {
    const result = summarizeEntries([entry({ amount: 80000 }), entry({ id: 'e2', amount: 5000 })])
    expect(result).toEqual({ fixedTotal: 85000, missingCount: 0 })
  })

  it('excludes null amounts from the total and counts them as missing', () => {
    const result = summarizeEntries([entry({ amount: 80000 }), entry({ id: 'e2', amount: null, variable: true })])
    expect(result).toEqual({ fixedTotal: 80000, missingCount: 1 })
  })

  it('returns zeros for an empty list', () => {
    expect(summarizeEntries([])).toEqual({ fixedTotal: 0, missingCount: 0 })
  })
})
