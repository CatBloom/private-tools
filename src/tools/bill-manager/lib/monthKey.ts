// 支払月キー（YYYYMM）の加減算・整形。react 非依存の純粋ロジック。

export const shiftMonth = (key: string, delta: number): string => {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(4, 6))
  const totalMonths = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonthIndex = ((totalMonths % 12) + 12) % 12
  return `${nextYear}${String(nextMonthIndex + 1).padStart(2, '0')}`
}

export const currentMonthKey = (date = new Date()): string =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`

// 編集可能かどうか: 今日の月（today）と翌月までが編集可、翌々月以降は不可。過去の月は常に編集可。
// YYYYMM は辞書順＝時系列順なので文字列比較で足りる。
export const isMonthEditable = (month: string, today: string): boolean => month <= shiftMonth(today, 1)

export const formatMonthLabel = (key: string): string => `${Number(key.slice(0, 4))}年${Number(key.slice(4, 6))}月`

export const yearOf = (key: string): number => Number(key.slice(0, 4))

// 指定年の支払月キー12件（YYYYMM01〜YYYYMM12）を1月始まりで返す。
export const monthsOfYear = (year: number): string[] =>
  Array.from({ length: 12 }, (_, index) => `${year}${String(index + 1).padStart(2, '0')}`)
