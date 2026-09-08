import { describe, expect, it } from 'vitest'
import { currentMonthKey, formatMonthLabel, shiftMonth } from './monthKey'

describe('shiftMonth', () => {
  it('adds months within the same year', () => {
    expect(shiftMonth('202603', 2)).toBe('202605')
  })

  it('subtracts months within the same year', () => {
    expect(shiftMonth('202603', -2)).toBe('202601')
  })

  it('rolls over into the next year', () => {
    expect(shiftMonth('202611', 3)).toBe('202702')
  })

  it('rolls back into the previous year', () => {
    expect(shiftMonth('202602', -3)).toBe('202511')
  })

  it('is a no-op for delta 0', () => {
    expect(shiftMonth('202609', 0)).toBe('202609')
  })
})

describe('currentMonthKey', () => {
  it('formats the given date as YYYYMM', () => {
    expect(currentMonthKey(new Date(2026, 8, 8))).toBe('202609')
  })

  it('pads single-digit months', () => {
    expect(currentMonthKey(new Date(2026, 0, 15))).toBe('202601')
  })
})

describe('formatMonthLabel', () => {
  it('formats YYYYMM as a Japanese year/month label', () => {
    expect(formatMonthLabel('202609')).toBe('2026年9月')
  })

  it('does not zero-pad the month in the label', () => {
    expect(formatMonthLabel('202601')).toBe('2026年1月')
  })
})
