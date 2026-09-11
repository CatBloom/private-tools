import { keepaliveInit, readResult } from '../../lib/api'
import type { LedgerState } from './shared/types'

const API_BASE = '/tools/bill-manager/api'

export const getLedger = async (): Promise<LedgerState> => {
  const response = await fetch(`${API_BASE}/ledger`)
  const data = await readResult<{ state: LedgerState }>(response)
  return data.state
}

export const putLedger = async (state: LedgerState, options?: { keepalive?: boolean }): Promise<LedgerState> => {
  const body = JSON.stringify({ state })
  const response = await fetch(`${API_BASE}/ledger`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    ...(options?.keepalive ? keepaliveInit(body) : {}),
  })
  const data = await readResult<{ state: LedgerState }>(response)
  return data.state
}
