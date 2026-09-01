import type { PromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { HistoryEntry } from '../../tools/prompt-builder/shared/types.js'

export interface PromptHistoryStorage {
  getHistory(category: PromptCategoryId): Promise<HistoryEntry[]>
  putHistory(category: PromptCategoryId, entries: HistoryEntry[]): Promise<HistoryEntry[]>
}
