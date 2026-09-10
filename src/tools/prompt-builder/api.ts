import { keepaliveInit, readResult } from '../../lib/api'
import type { HistoryEntry, PromptWord } from './shared/types'

const API_BASE = '/tools/prompt-builder/api'

export const getWords = async (): Promise<PromptWord[]> => {
  const response = await fetch(`${API_BASE}/words`)
  const data = await readResult<{ words: PromptWord[] }>(response)
  return data.words
}

export const putWords = async (words: PromptWord[], options?: { keepalive?: boolean }): Promise<PromptWord[]> => {
  const body = JSON.stringify({ words })
  const response = await fetch(`${API_BASE}/words`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    ...(options?.keepalive ? keepaliveInit(body) : {}),
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
