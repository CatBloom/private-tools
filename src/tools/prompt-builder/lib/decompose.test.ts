import { describe, expect, it } from 'vitest'
import { buildDecomposeRows, buildPrompt, remapRowEdits, setRowEdit, toOutputItems, tokenKeys, type RowEdit } from './decompose'
import { parsePrompt } from './parsePrompt'

describe('tokenKeys', () => {
  it('keys tokens by text and occurrence order within the same text', () => {
    expect(tokenKeys(parsePrompt('AAAA,BBBB,AAAA'))).toEqual(['AAAA#0', 'BBBB#0', 'AAAA#1'])
  })
})

describe('buildDecomposeRows', () => {
  it('defaults to the original text, others tag, and empty description when there is no edit', () => {
    const rows = buildDecomposeRows(parsePrompt('AAAA,{{BBBB}}'), new Map())

    expect(rows).toEqual([
      { key: 'AAAA#0', originalText: 'AAAA', weight: 0, text: 'AAAA', tag: 'others', description: '' },
      { key: 'BBBB#0', originalText: 'BBBB', weight: 2, text: 'BBBB', tag: 'others', description: '' },
    ])
  })

  it('carries an edit over to the row matching its key', () => {
    const edits = new Map<string, RowEdit>([['AAAA#0', { text: 'edited', tag: 'expression', description: 'memo' }]])
    const rows = buildDecomposeRows(parsePrompt('AAAA,BBBB'), edits)

    expect(rows[0]).toMatchObject({ text: 'edited', tag: 'expression', description: 'memo' })
    expect(rows[1]).toMatchObject({ text: 'BBBB', tag: 'others', description: '' })
  })
})

describe('remapRowEdits', () => {
  it('carries the remaining duplicate row\'s edit to its new key and drops the removed row\'s edit', () => {
    const edits = new Map<string, RowEdit>([
      ['AAAA#0', { text: 'first-edit', tag: 'expression', description: 'a' }],
      ['AAAA#1', { text: 'second-edit', tag: 'quality', description: 'b' }],
    ])
    const rows = buildDecomposeRows(parsePrompt('AAAA,AAAA'), edits)
    const remaining = rows.filter((row) => row.key !== 'AAAA#0')

    const remapped = remapRowEdits(edits, remaining)

    expect(remapped.size).toBe(1)
    expect(remapped.get('AAAA#0')).toEqual({ text: 'second-edit', tag: 'quality', description: 'b' })
  })
})

describe('setRowEdit', () => {
  it('merges the patch into the base without mutating the input map', () => {
    const original = new Map<string, RowEdit>()
    const base: RowEdit = { text: 'AAAA', tag: 'others', description: '' }

    const next = setRowEdit(original, 'AAAA#0', base, { tag: 'expression' })

    expect(original.size).toBe(0)
    expect(next.get('AAAA#0')).toEqual({ text: 'AAAA', tag: 'expression', description: '' })
  })
})

describe('buildPrompt', () => {
  it('joins tokens with ", " and reapplies each weight as bracket notation', () => {
    expect(buildPrompt([{ text: 'AAAA', weight: 0 }, { text: 'BBBB', weight: 2 }, { text: 'CCCC', weight: -1 }])).toBe(
      'AAAA, {{BBBB}}, [CCCC]',
    )
  })

  it('round-trips with parsePrompt for weights within the notation range', () => {
    const tokens = [{ text: 'AAAA', weight: 2 }, { text: 'BBBB', weight: -1 }, { text: 'CCCC', weight: 0 }]
    expect(parsePrompt(buildPrompt(tokens))).toEqual(tokens)
  })
})

describe('toOutputItems', () => {
  it('trims text, keeps the original weight, and generates ids via the injected creator', () => {
    let nextId = 0
    const items = toOutputItems([{ text: ' AAAA ', weight: 2 }, { text: 'BBBB', weight: 0 }], () => `id-${nextId++}`)

    expect(items).toEqual([
      { id: 'id-0', wordId: null, text: 'AAAA', weight: 2 },
      { id: 'id-1', wordId: null, text: 'BBBB', weight: 0 },
    ])
  })
})
