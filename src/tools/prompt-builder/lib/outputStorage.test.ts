import { beforeEach, describe, expect, it } from 'vitest'
import { readOutputItems, writeOutputItems } from './outputStorage'
import type { OutputItem } from '../shared/types'

const item = (text: string): OutputItem => ({ id: text, wordId: text, text, weight: 0 })

describe('outputStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores each category under its own key', () => {
    writeOutputItems('base-prompt', [item('cat girl')])
    writeOutputItems('base-negative', [item('blurry')])

    expect(readOutputItems('base-prompt')).toEqual([item('cat girl')])
    expect(readOutputItems('base-negative')).toEqual([item('blurry')])
  })

  it('does not let a write to one category affect another', () => {
    writeOutputItems('base-prompt', [item('cat girl')])
    writeOutputItems('base-prompt', [item('cat girl'), item('blue sky')])

    expect(readOutputItems('base-negative')).toEqual([])
    expect(readOutputItems('character-prompt')).toEqual([])
    expect(readOutputItems('base-prompt')).toEqual([item('cat girl'), item('blue sky')])
  })

  it('returns an empty array for a category with nothing stored', () => {
    expect(readOutputItems('character-negative')).toEqual([])
  })

  it('does not use the old shared cross-category key', () => {
    writeOutputItems('base-prompt', [item('cat girl')])

    expect(localStorage.getItem('prompt-builder:output-state')).toBeNull()
    expect(localStorage.getItem('prompt-builder:output:base-prompt')).not.toBeNull()
  })
})
