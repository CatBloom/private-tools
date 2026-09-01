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

export const getWords = async (): Promise<PromptWord[]> => {
  const response = await fetch(`${API_BASE}/words`)
  const data = await readResult<{ words: PromptWord[] }>(response)
  return data.words
}

export const putWords = async (words: PromptWord[]): Promise<PromptWord[]> => {
  const response = await fetch(`${API_BASE}/words`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
  })
  const data = await readResult<{ words: PromptWord[] }>(response)
  return data.words
}

export const getHistory = async (): Promise<HistoryEntry[]> => {
  const response = await fetch(`${API_BASE}/history`)
  const data = await readResult<{ entries: HistoryEntry[] }>(response)
  return data.entries
}

export const putHistory = async (entries: HistoryEntry[]): Promise<HistoryEntry[]> => {
  const response = await fetch(`${API_BASE}/history`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  })
  const data = await readResult<{ entries: HistoryEntry[] }>(response)
  return data.entries
}
