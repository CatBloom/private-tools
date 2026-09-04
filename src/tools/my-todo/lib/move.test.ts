import { describe, expect, it } from 'vitest'
import { canPlaceInToday, countUnfinished, moveItem } from './move'
import { TODAY_LIMIT, type TodoItem, type TodoState } from '../shared/types'

const item = (id: string, overrides: Partial<TodoItem> = {}): TodoItem => ({
  id,
  text: id,
  completed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const state = (today: TodoItem[], someday: TodoItem[] = []): TodoState => ({
  today,
  someday,
  lastRolloverDate: '2026-01-01',
})

describe('countUnfinished', () => {
  it('counts only uncompleted items', () => {
    expect(countUnfinished([item('a'), item('b', { completed: true }), item('c')])).toBe(2)
  })

  it('returns 0 for an empty list', () => {
    expect(countUnfinished([])).toBe(0)
  })
})

describe('canPlaceInToday', () => {
  it('allows placing an uncompleted item when under the limit', () => {
    const today = Array.from({ length: TODAY_LIMIT - 1 }, (_, i) => item(`t${i}`))
    expect(canPlaceInToday(today, false)).toBe(true)
  })

  it('blocks placing an uncompleted item once the limit is reached', () => {
    const today = Array.from({ length: TODAY_LIMIT }, (_, i) => item(`t${i}`))
    expect(canPlaceInToday(today, false)).toBe(false)
  })

  it('always allows placing a completed item, even at the limit', () => {
    const today = Array.from({ length: TODAY_LIMIT }, (_, i) => item(`t${i}`))
    expect(canPlaceInToday(today, true)).toBe(true)
  })

  it('ignores completed items already in today when counting toward the limit', () => {
    const today = [
      ...Array.from({ length: TODAY_LIMIT }, (_, i) => item(`done${i}`, { completed: true })),
      item('open'),
    ]
    expect(canPlaceInToday(today, false)).toBe(true)
  })
})

describe('moveItem', () => {
  it('moves an item from someday to today, removing it from the source', () => {
    const s = state([], [item('a'), item('b')])
    const result = moveItem(s, 'a', 'someday', 'today')

    expect(result.someday).toEqual([item('b')])
    expect(result.today).toEqual([item('a')])
  })

  it('moves an item from today to someday with no capacity limit', () => {
    const today = Array.from({ length: TODAY_LIMIT }, (_, i) => item(`t${i}`))
    const s = state(today, [])
    const result = moveItem(s, 't0', 'today', 'someday')

    expect(result.today.map((i) => i.id)).toEqual(today.slice(1).map((i) => i.id))
    expect(result.someday).toEqual([item('t0')])
  })

  it('returns the same state reference when today is full and the item is uncompleted', () => {
    const today = Array.from({ length: TODAY_LIMIT }, (_, i) => item(`t${i}`))
    const s = state(today, [item('a')])
    expect(moveItem(s, 'a', 'someday', 'today')).toBe(s)
  })

  it('allows moving a completed item into today even when today is full', () => {
    const today = Array.from({ length: TODAY_LIMIT }, (_, i) => item(`t${i}`))
    const s = state(today, [item('a', { completed: true })])
    const result = moveItem(s, 'a', 'someday', 'today')

    expect(result.today).toHaveLength(TODAY_LIMIT + 1)
    expect(result.someday).toEqual([])
  })

  it('returns the same state reference when the item id is not found', () => {
    const s = state([], [item('a')])
    expect(moveItem(s, 'missing', 'someday', 'today')).toBe(s)
  })

  it('returns the same state reference when from and to are the same section', () => {
    const s = state([item('a')], [])
    expect(moveItem(s, 'a', 'today', 'today')).toBe(s)
  })
})
