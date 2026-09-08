import type { LedgerState } from './shared/types'

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

const API_BASE = '/tools/bill-manager/api'

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

export const getLedger = async (): Promise<LedgerState> => {
  const response = await fetch(`${API_BASE}/ledger`)
  const data = await readResult<{ state: LedgerState }>(response)
  return data.state
}

export const putLedger = async (state: LedgerState): Promise<LedgerState> => {
  const response = await fetch(`${API_BASE}/ledger`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  const data = await readResult<{ state: LedgerState }>(response)
  return data.state
}
