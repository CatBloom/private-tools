import { Hono } from 'hono'
import type { LedgerEntry, LedgerMonth, LedgerState, SpecialExpense } from '../../tools/bill-manager/shared/types.js'
import {
  MAX_ENTRIES_PER_MONTH,
  MAX_ENTRY_AMOUNT,
  MAX_ENTRY_NAME_LENGTH,
  MAX_MEMO_LENGTH,
  MAX_MONTHS,
  MAX_SPECIALS_PER_MONTH,
  createEmptyLedgerState,
  isEntryCategory,
  isMonthKey,
} from '../../tools/bill-manager/shared/types.js'
import { selectBillManagerStorage } from '../storage/bill-manager/index.js'
import type { BillManagerStorage } from '../storage/bill-manager/index.js'
import { apiError, apiOk, jsonBodyLimit, notFoundJson, readJsonBody } from './shared.js'

const MAX_BODY_BYTES = 4 * 1024 * 1024

const isValidAmount = (amount: unknown): amount is number | null =>
  amount === null ||
  (typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= MAX_ENTRY_AMOUNT)

// income・extraIncome と違い、必須（null 不可）の金額フィールド用。
const isRequiredAmount = (amount: unknown): amount is number =>
  typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= MAX_ENTRY_AMOUNT

const isLedgerEntry = (value: unknown): value is LedgerEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as LedgerEntry).id === 'string' &&
  (value as LedgerEntry).id.length > 0 &&
  typeof (value as LedgerEntry).name === 'string' &&
  (value as LedgerEntry).name.length <= MAX_ENTRY_NAME_LENGTH &&
  isValidAmount((value as LedgerEntry).amount) &&
  isEntryCategory((value as LedgerEntry).category) &&
  typeof (value as LedgerEntry).variable === 'boolean' &&
  typeof (value as LedgerEntry).carryOver === 'boolean' &&
  typeof (value as LedgerEntry).excluded === 'boolean'

const isLedgerEntryArray = (value: unknown): value is LedgerEntry[] =>
  Array.isArray(value) && value.length <= MAX_ENTRIES_PER_MONTH && value.every(isLedgerEntry)

const isSpecialExpense = (value: unknown): value is SpecialExpense =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SpecialExpense).id === 'string' &&
  (value as SpecialExpense).id.length > 0 &&
  isRequiredAmount((value as SpecialExpense).amount) &&
  typeof (value as SpecialExpense).memo === 'string' &&
  (value as SpecialExpense).memo.length <= MAX_MEMO_LENGTH

const isSpecialExpenseArray = (value: unknown): value is SpecialExpense[] =>
  Array.isArray(value) && value.length <= MAX_SPECIALS_PER_MONTH && value.every(isSpecialExpense)

// LedgerMonth はプレーンオブジェクトであること（配列ではない）。
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLedgerMonth = (value: unknown): value is LedgerMonth =>
  isPlainObject(value) &&
  isLedgerEntryArray(value.entries) &&
  isValidAmount(value.income) &&
  isValidAmount(value.extraIncome) &&
  isSpecialExpenseArray(value.specials)

const isLedgerState = (value: unknown): value is LedgerState => {
  if (typeof value !== 'object' || value === null) return false
  const months = (value as LedgerState).months
  if (!isPlainObject(months)) return false
  const keys = Object.keys(months)
  if (keys.length > MAX_MONTHS) return false
  return keys.every((key) => isMonthKey(key) && isLedgerMonth(months[key]))
}

// 構造（プレーンオブジェクト／配列）だけを見て、フィールドの妥当性は問わず上限超過を検出する。
// isLedgerState が false のとき、400（不正な形）と 413（上限超過）を切り分けるために使う。
const isOversizedLedgerState = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const months = (value as LedgerState).months
  if (!isPlainObject(months)) return false
  const keys = Object.keys(months)
  if (keys.length > MAX_MONTHS) return true
  return keys.some((key) => {
    const month = months[key]
    if (!isPlainObject(month)) return false
    if (Array.isArray(month.entries) && month.entries.length > MAX_ENTRIES_PER_MONTH) return true
    if (Array.isArray(month.specials) && month.specials.length > MAX_SPECIALS_PER_MONTH) return true
    return false
  })
}

export const createBillManagerRoutes = (storage: BillManagerStorage = selectBillManagerStorage()) => {
  const app = new Hono()

  app.get('/ledger', async (c) => {
    const state = (await storage.getLedger()) ?? createEmptyLedgerState()
    return apiOk(c, { state })
  })

  app.put('/ledger', jsonBodyLimit(MAX_BODY_BYTES), async (c) => {
    const body = await readJsonBody(c)
    if (!body.ok) return body.response

    const state = (body.value as { state?: unknown } | null)?.state
    if (!isLedgerState(state)) {
      if (isOversizedLedgerState(state)) {
        return apiError(c, 413, 'Too many months, entries, or specials.')
      }
      return apiError(c, 400, 'Invalid state payload.')
    }

    await storage.putLedger(state)
    return apiOk(c, { state })
  })

  app.notFound(notFoundJson)

  return app
}
