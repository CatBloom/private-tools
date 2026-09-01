import { beforeEach, describe, expect, it } from 'vitest'
import { readOutputItems, writeOutputItems } from './outputStorage'
import type { OutputItem } from '../shared/types'

const item = (text: string): OutputItem => ({ id: text, wordId: text, text, weight: 0 })

describe('outputStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty array when nothing is stored yet', () => {
    expect(readOutputItems()).toEqual([])
  })

  it('round-trips items written under the shared key', () => {
    writeOutputItems([item('cat girl'), item('blue sky')])

    expect(readOutputItems()).toEqual([item('cat girl'), item('blue sky')])
    expect(localStorage.getItem('prompt-builder:output')).not.toBeNull()
  })

  it('overwrites the previous value on each write', () => {
    writeOutputItems([item('cat girl')])
    writeOutputItems([item('blue sky')])

    expect(readOutputItems()).toEqual([item('blue sky')])
  })
})
