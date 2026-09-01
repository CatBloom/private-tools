import { isPromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { PromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { PromptWord } from '../../tools/prompt-builder/shared/types.js'

export interface PromptWordStorage {
  getWords(category: PromptCategoryId): Promise<PromptWord[]>
  putWords(category: PromptCategoryId, words: PromptWord[]): Promise<PromptWord[]>
}

// category is the only user-controlled input that reaches storage backends
// (local file paths, KV keys), so every implementation must validate through
// this pattern before touching a path or key — never interpolate a category
// that hasn't passed it.
export const assertValidCategory = (category: string): void => {
  if (!isPromptCategoryId(category)) {
    throw new Error(`Invalid prompt category: ${category}`)
  }
}
