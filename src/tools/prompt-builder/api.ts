import { readResult } from '../../lib/api'
import type { HistoryEntry, PromptWord } from './shared/types'

const API_BASE = '/tools/prompt-builder/api'
// fetch の keepalive はボディ合計約64KiBを超えると即失敗するため、それより小さい閾値で無効化する。
const KEEPALIVE_BODY_LIMIT_BYTES = 60 * 1024

export const getWords = async (): Promise<PromptWord[]> => {
  const response = await fetch(`${API_BASE}/words`)
  const data = await readResult<{ words: PromptWord[] }>(response)
  return data.words
}

export const putWords = async (words: PromptWord[], options?: { keepalive?: boolean }): Promise<PromptWord[]> => {
  const body = JSON.stringify({ words })
  const useKeepalive = Boolean(options?.keepalive) && new TextEncoder().encode(body).byteLength <= KEEPALIVE_BODY_LIMIT_BYTES
  const response = await fetch(`${API_BASE}/words`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    // pagehide からの flush はページ破棄後も送信を継続させるため keepalive を付ける（上限内のときだけ）。
    ...(useKeepalive ? { keepalive: true } : {}),
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
