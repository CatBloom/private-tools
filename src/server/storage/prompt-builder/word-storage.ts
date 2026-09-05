import type { PromptWord } from '../../../tools/prompt-builder/shared/types.js'

export interface PromptWordStorage {
  getWords(): Promise<PromptWord[]>
  putWords(words: PromptWord[]): Promise<PromptWord[]>
}
