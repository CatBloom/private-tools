import { describe, expect, it } from 'vitest'
import { rollover, toLocalDateString } from './rollover'
import type { TodoItem, TodoState } from '../shared/types'

const item = (id: string, overrides: Partial<TodoItem> = {}): TodoItem => ({
  id,
  text: id,
  completed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('toLocalDateString', () => {
  it('formats a date as YYYY-MM-DD using local fields', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('rollover', () => {
  it('returns the same state reference when the date has not changed', () => {
    const state: TodoState = { today: [item('a')], someday: [], lastRolloverDate: '2026-09-05' }
    expect(rollover(state, '2026-09-05')).toBe(state)
  })

  it('on first run (lastRolloverDate null), only records the date and leaves items untouched', () => {
    const state: TodoState = {
      today: [item('a'), item('b', { completed: true })],
      someday: [item('c', { completed: true })],
      lastRolloverDate: null,
    }
    const result = rollover(state, '2026-09-05')

    expect(result).toEqual({ ...state, lastRolloverDate: '2026-09-05' })
    expect(result.today).toBe(state.today)
    expect(result.someday).toBe(state.someday)
  })

  it('on a new day, drops completed items from both sections and carries over unfinished today items to someday', () => {
    const state: TodoState = {
      today: [item('a'), item('b', { completed: true }), item('c')],
      someday: [item('d'), item('e', { completed: true })],
      lastRolloverDate: '2026-09-04',
    }
    const result = rollover(state, '2026-09-05')

    expect(result.today).toEqual([])
    expect(result.someday.map((i) => i.id)).toEqual(['d', 'a', 'c'])
    expect(result.lastRolloverDate).toBe('2026-09-05')
  })

  it('produces an empty someday when there is nothing left to carry over', () => {
    const state: TodoState = {
      today: [item('a', { completed: true })],
      someday: [item('b', { completed: true })],
      lastRolloverDate: '2026-09-04',
    }
    const result = rollover(state, '2026-09-05')

    expect(result.today).toEqual([])
    expect(result.someday).toEqual([])
  })
})
