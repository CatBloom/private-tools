import { parseUploadedCsv } from '../../../lib/credit-csv/csv'

// 支払月と同じ月の CSV を使う。credit-csv 側で請求月に合わせて命名済みのため
// Bill Manager ではずらさない。
export const sumCreditCsv = (fileName: string, bytes: ArrayBuffer): number =>
  parseUploadedCsv(fileName, bytes).reduce((total, transaction) => total + transaction.amount, 0)
