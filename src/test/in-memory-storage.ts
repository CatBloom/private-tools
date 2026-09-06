import type { TodoState } from '../tools/my-todo/shared/types.js'
import type { MyTodoStorage } from '../server/storage/my-todo/index.js'
import type { HistoryEntry, PromptWord } from '../tools/prompt-builder/shared/types.js'
import type { PromptHistoryStorage, PromptWordStorage } from '../server/storage/prompt-builder/index.js'

export class InMemoryTodoStorage implements MyTodoStorage {
  private state: TodoState | null = null

  async getTodos(): Promise<TodoState | null> {
    return this.state
  }

  async putTodos(state: TodoState): Promise<void> {
    this.state = state
  }
}

export class InMemoryPromptStorage implements PromptWordStorage {
  private words: PromptWord[] = []

  async getWords(): Promise<PromptWord[]> {
    return this.words
  }

  async putWords(words: PromptWord[]): Promise<PromptWord[]> {
    this.words = words
    return words
  }
}

export class InMemoryHistoryStorage implements PromptHistoryStorage {
  private entries: HistoryEntry[] = []

  async getHistory(): Promise<HistoryEntry[]> {
    return this.entries
  }

  async putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    this.entries = entries
    return entries
  }
}
