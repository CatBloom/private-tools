import { describe, expect, it } from 'vitest'
import { formatAmountOrDash, formatYen } from './format'

describe('formatYen', () => {
  it('formats zero', () => {
    expect(formatYen(0)).toBe('0円')
  })

  it('formats a negative amount', () => {
    expect(formatYen(-1500)).toBe('-1,500円')
  })

  it('adds thousands separators', () => {
    expect(formatYen(1234567)).toBe('1,234,567円')
  })
})

describe('formatAmountOrDash', () => {
  it('renders null as a dash', () => {
    expect(formatAmountOrDash(null)).toBe('–')
  })

  it('formats zero', () => {
    expect(formatAmountOrDash(0)).toBe('0')
  })

  it('formats a negative amount', () => {
    expect(formatAmountOrDash(-1500)).toBe('-1,500')
  })

  it('adds thousands separators', () => {
    expect(formatAmountOrDash(1234567)).toBe('1,234,567')
  })
})
