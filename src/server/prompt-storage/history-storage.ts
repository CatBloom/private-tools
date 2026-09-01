import type { HistoryEntry } from '../../tools/prompt-builder/shared/types.js'

export interface PromptHistoryStorage {
  getHistory(): Promise<HistoryEntry[]>
  putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]>
}
