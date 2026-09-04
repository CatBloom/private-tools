import { describe, expect, it } from 'vitest'
import { DEFAULT_TAG, PROMPT_TAG_IDS, isPromptTagId, normalizeTag } from './tags'

describe('isPromptTagId', () => {
  it('accepts every id in PROMPT_TAG_IDS', () => {
    for (const id of PROMPT_TAG_IDS) {
      expect(isPromptTagId(id)).toBe(true)
    }
  })

  it('accepts a newly introduced tag', () => {
    expect(isPromptTagId('appearance')).toBe(true)
    expect(isPromptTagId('scene')).toBe(true)
  })

  it('rejects an unknown value', () => {
    expect(isPromptTagId('not-a-tag')).toBe(false)
  })
})

describe('normalizeTag', () => {
  it('returns a valid tag unchanged', () => {
    expect(normalizeTag('appearance')).toBe('appearance')
    expect(normalizeTag('scene')).toBe('scene')
  })

  it('falls back to DEFAULT_TAG for missing or invalid values', () => {
    expect(normalizeTag(undefined)).toBe(DEFAULT_TAG)
    expect(normalizeTag('not-a-tag')).toBe(DEFAULT_TAG)
    expect(normalizeTag(42)).toBe(DEFAULT_TAG)
  })

  it('falls back to DEFAULT_TAG for tags removed in the tag set migration', () => {
    expect(normalizeTag('pose')).toBe(DEFAULT_TAG)
    expect(normalizeTag('angle')).toBe(DEFAULT_TAG)
    expect(normalizeTag('parts')).toBe(DEFAULT_TAG)
    expect(normalizeTag('composition')).toBe(DEFAULT_TAG)
    expect(normalizeTag('situation')).toBe(DEFAULT_TAG)
  })
})
