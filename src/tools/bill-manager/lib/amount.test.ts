import { describe, expect, it } from 'vitest'
import { parseAmountInput } from './amount'
import { MAX_ENTRY_AMOUNT } from '../shared/types'

describe('parseAmountInput', () => {
  it('treats an empty string as unset', () => {
    expect(parseAmountInput('')).toBeNull()
  })

  it('treats a whitespace-only string as unset', () => {
    expect(parseAmountInput('   ')).toBeNull()
  })

  it('treats a non-numeric string as unset', () => {
    expect(parseAmountInput('abc')).toBeNull()
  })

  it('truncates a decimal value', () => {
    expect(parseAmountInput('1234.9')).toBe(1234)
  })

  it('parses exponential notation', () => {
    expect(parseAmountInput('1e3')).toBe(1000)
  })

  // 現状は負値を弾かない（呼び出し側・サーバーのバリデーションに委ねている挙動をそのまま維持）。
  it('currently passes a negative value through', () => {
    expect(parseAmountInput('-500')).toBe(-500)
  })

  // 現状は MAX_ENTRY_AMOUNT を超える値もそのまま返す（上限チェックは呼び出し側の責務）。
  it('currently passes a value above MAX_ENTRY_AMOUNT through', () => {
    expect(parseAmountInput(String(MAX_ENTRY_AMOUNT + 1))).toBe(MAX_ENTRY_AMOUNT + 1)
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(parseAmountInput('  42  ')).toBe(42)
  })
})
