import type { HistoryEntry, PromptWord } from '../../../tools/prompt-builder/shared/types.js'

export interface PromptWordStorage {
  getWords(): Promise<PromptWord[]>
  putWords(words: PromptWord[]): Promise<PromptWord[]>
}

export interface PromptHistoryStorage {
  getHistory(): Promise<HistoryEntry[]>
  putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]>
}
