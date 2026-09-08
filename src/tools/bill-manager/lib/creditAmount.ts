import { parseUploadedCsv } from '../../../lib/credit-csv/csv'
import { shiftMonth } from './monthKey'

// 支払月は利用月の何か月後か（クレカの締め・支払いサイクル）。
export const CREDIT_PAYMENT_OFFSET_MONTHS = 1

// 支払月 M のクレカ額は利用月 M-1 の CSV から算出する。
export const creditUsageMonth = (paymentMonth: string): string => shiftMonth(paymentMonth, -CREDIT_PAYMENT_OFFSET_MONTHS)

export const sumCreditCsv = (fileName: string, bytes: ArrayBuffer): number =>
  parseUploadedCsv(fileName, bytes).reduce((total, transaction) => total + transaction.amount, 0)
