import { describe, expect, it } from 'vitest'
import { applyNotation, buildOutput, clampWeight, reorder } from './notation'
import type { OutputItem } from '../shared/types'

describe('clampWeight', () => {
  it('clamps positive weight to the upper limit', () => {
    expect(clampWeight(9)).toBe(5)
  })

  it('clamps negative weight to the lower limit', () => {
    expect(clampWeight(-9)).toBe(-5)
  })

  it('leaves in-range weight untouched', () => {
    expect(clampWeight(3)).toBe(3)
    expect(clampWeight(-3)).toBe(-3)
    expect(clampWeight(0)).toBe(0)
  })
})

describe('applyNotation', () => {
  it('wraps text in matching braces for positive weight', () => {
    expect(applyNotation('cat', 1)).toBe('{cat}')
    expect(applyNotation('cat', 3)).toBe('{{{cat}}}')
  })

  it('wraps text in matching brackets for negative weight', () => {
    expect(applyNotation('cat', -1)).toBe('[cat]')
    expect(applyNotation('cat', -3)).toBe('[[[cat]]]')
  })

  it('returns plain text for weight 0', () => {
    expect(applyNotation('cat', 0)).toBe('cat')
  })

  it('clamps weight beyond the limit before wrapping', () => {
    expect(applyNotation('cat', 9)).toBe('{{{{{cat}}}}}')
    expect(applyNotation('cat', -9)).toBe('[[[[[cat]]]]]')
  })
})

describe('buildOutput', () => {
  const item = (overrides: Partial<OutputItem>): OutputItem => ({
    id: 'id',
    wordId: null,
    text: '',
    weight: 0,
    ...overrides,
  })

  it('joins items with a comma and space, applying notation', () => {
    const items = [item({ id: '1', text: 'cat', weight: 1 }), item({ id: '2', text: 'dog', weight: -2 })]
    expect(buildOutput(items)).toBe('{cat}, [[dog]]')
  })

  it('returns an empty string for an empty array', () => {
    expect(buildOutput([])).toBe('')
  })

  it('skips items whose text is blank after trimming', () => {
    const items = [item({ id: '1', text: '  ', weight: 2 }), item({ id: '2', text: 'dog' })]
    expect(buildOutput(items)).toBe('dog')
  })
})

describe('reorder', () => {
  it('moves an item from one index to another', () => {
    expect(reorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('returns the same array reference when indexes are equal', () => {
    const items = ['a', 'b', 'c']
    expect(reorder(items, 1, 1)).toBe(items)
  })

  it('returns the same array reference for out-of-range indexes', () => {
    const items = ['a', 'b', 'c']
    expect(reorder(items, -1, 1)).toBe(items)
    expect(reorder(items, 1, 5)).toBe(items)
  })
})
