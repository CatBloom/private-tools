import type { LedgerState } from '../../../tools/bill-manager/shared/types.js'

export interface BillManagerStorage {
  getLedger(): Promise<LedgerState | null>
  putLedger(state: LedgerState): Promise<void>
}
