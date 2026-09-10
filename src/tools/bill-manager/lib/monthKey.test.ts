import { describe, expect, it } from 'vitest'
import { currentMonthKey, formatMonthLabel, isMonthEditable, monthsOfYear, shiftMonth, yearOf } from './monthKey'

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

describe('yearOf', () => {
  it('extracts the year from a month key', () => {
    expect(yearOf('202609')).toBe(2026)
  })
})

describe('isMonthEditable', () => {
  it('is editable for the current month', () => {
    expect(isMonthEditable('202609', '202609')).toBe(true)
  })

  it('is editable for the next month', () => {
    expect(isMonthEditable('202610', '202609')).toBe(true)
  })

  it('is not editable two months ahead', () => {
    expect(isMonthEditable('202611', '202609')).toBe(false)
  })

  it('is editable for a past month', () => {
    expect(isMonthEditable('202605', '202609')).toBe(true)
  })

  it('is editable for the next month across a year boundary', () => {
    expect(isMonthEditable('202701', '202612')).toBe(true)
  })

  it('is not editable two months ahead across a year boundary', () => {
    expect(isMonthEditable('202702', '202612')).toBe(false)
  })
})

describe('monthsOfYear', () => {
  it('returns all 12 month keys for a year, January first', () => {
    expect(monthsOfYear(2026)).toEqual([
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
  })
})
