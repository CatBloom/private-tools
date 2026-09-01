import type { PromptCategoryId } from './shared/categories'
import type { HistoryEntry, PromptWord } from './shared/types'

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

const API_BASE = '/tools/prompt-builder/api'

const readResult = async <T>(response: Response): Promise<T> => {
  let body: ApiResult<T>
  try {
    body = (await response.json()) as ApiResult<T>
  } catch {
    throw new Error(`サーバーとの通信に失敗しました。(status: ${response.status})`)
  }

  if (!body.ok) {
    throw new Error(body.error.message)
  }

  return body.data
}

export const getWords = async (category: PromptCategoryId): Promise<PromptWord[]> => {
  const response = await fetch(`${API_BASE}/words/${category}`)
  const data = await readResult<{ words: PromptWord[] }>(response)
  return data.words
}

export const putWords = async (category: PromptCategoryId, words: PromptWord[]): Promise<PromptWord[]> => {
  const response = await fetch(`${API_BASE}/words/${category}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
  })
  const data = await readResult<{ words: PromptWord[] }>(response)
  return data.words
}

export const getHistory = async (category: PromptCategoryId): Promise<HistoryEntry[]> => {
  const response = await fetch(`${API_BASE}/history/${category}`)
  const data = await readResult<{ entries: HistoryEntry[] }>(response)
  return data.entries
}

export const putHistory = async (category: PromptCategoryId, entries: HistoryEntry[]): Promise<HistoryEntry[]> => {
  const response = await fetch(`${API_BASE}/history/${category}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  })
  const data = await readResult<{ entries: HistoryEntry[] }>(response)
  return data.entries
}
