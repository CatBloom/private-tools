import { describe, expect, it } from 'vitest'
import { sumCreditCsv } from './creditAmount'

// 実カード明細は使わない。合成データのみ（CLAUDE.md「テスト」節）。
const toBytes = (text: string): ArrayBuffer => {
  const buffer = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    buffer[index] = text.charCodeAt(index)
  }
  return buffer.buffer
}

describe('sumCreditCsv', () => {
  it('sums the amount of every parsed transaction', () => {
    const csv = ["2026/8/1,Store A,x,x,,'26/09,500,500", "2026/8/2,Store B,x,x,,'26/09,1200,1200"].join('\n')
    expect(sumCreditCsv('202608.csv', toBytes(csv))).toBe(1700)
  })

  it('returns 0 for a file with no parseable rows', () => {
    expect(sumCreditCsv('202608.csv', toBytes(''))).toBe(0)
  })

  it('returns 0 when the filename does not match the YYYYMM.csv pattern', () => {
    expect(sumCreditCsv('readme.txt', toBytes("2026/8/1,Store A,x,x,,'26/09,500,500"))).toBe(0)
  })
})
