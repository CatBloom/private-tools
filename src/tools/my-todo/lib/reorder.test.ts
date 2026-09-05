import { describe, expect, it } from 'vitest'
import { reorder } from './reorder'

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
