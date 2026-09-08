import type { LedgerEntry } from '../shared/types'

export type EntriesSummary = {
  fixedTotal: number
  missingCount: number
}

// amount が null（未入力）の行は合計に含めず missingCount で数える。
export const summarizeEntries = (entries: LedgerEntry[]): EntriesSummary =>
  entries.reduce<EntriesSummary>(
    (acc, entry) =>
      entry.amount === null
        ? { ...acc, missingCount: acc.missingCount + 1 }
        : { ...acc, fixedTotal: acc.fixedTotal + entry.amount },
    { fixedTotal: 0, missingCount: 0 },
  )
