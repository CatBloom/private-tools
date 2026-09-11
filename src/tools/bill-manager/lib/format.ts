// 金額表示の共通フォーマット。react 非依存の純粋ロジック。

const yenFormatter = new Intl.NumberFormat('ja-JP')

export const formatYen = (value: number): string => `${yenFormatter.format(value)}円`

// 年間ビューの null（未入力・クレカ未取込等）は「–」で表示する。
export const formatAmountOrDash = (value: number | null): string => (value === null ? '–' : yenFormatter.format(value))
