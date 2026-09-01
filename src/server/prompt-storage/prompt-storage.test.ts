import { describe, expect, it } from 'vitest'
import { assertValidCategory } from './prompt-storage'

describe('assertValidCategory', () => {
  it.each(['base-prompt', 'base-negative', 'character-prompt', 'character-negative'])(
    'accepts the valid category %j',
    (category) => {
      expect(() => assertValidCategory(category)).not.toThrow()
    },
  )

  it.each(['', 'base', 'BASE-PROMPT', '../base-prompt', 'base-prompt-extra'])(
    'rejects the invalid category %j',
    (category) => {
      expect(() => assertValidCategory(category)).toThrow()
    },
  )
})
