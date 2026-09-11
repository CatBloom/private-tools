// 金額入力欄のパース。react 非依存の純粋ロジック。

// 空欄は null（未入力）、数値でなければ null、小数は切り捨てる。
export const parseAmountInput = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}
