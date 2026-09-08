// Bill Manager の react 非依存な型と定数。サーバー route からも import するため JSX を含めない。

/** 支払月ごとの固定費の1行。 */
export type LedgerEntry = {
  id: string
  /** 家賃・電気・ガス など。 */
  name: string
  /** null = 未入力（variable な行を翌月へコピーした直後など）。 */
  amount: number | null
  /** true = 毎月変わる。翌月へコピーする際に amount を null にする。 */
  variable: boolean
  /** false = 翌月へコピーしない（この月で支払い終了）。過去月には残る。 */
  carryOver: boolean
}

/**
 * 支払月（YYYYMM）→ その月の行スナップショット。
 * マスターは持たず、月ごとに独立して保存する。ある月を編集しても他の月には波及しない。
 * クレカ額はここに保存しない（表示時に credit-csv の CSV から算出する）。
 */
export type LedgerState = {
  months: Record<string, LedgerEntry[]>
}

export const createEmptyLedgerState = (): LedgerState => ({ months: {} })

/** 支払月キー（YYYYMM、月は 01〜12）。 */
export const MONTH_KEY_PATTERN = /^\d{4}(0[1-9]|1[0-2])$/
export const isMonthKey = (value: string): boolean => MONTH_KEY_PATTERN.test(value)

// 構造的な上限。クライアントの先回りチェックとサーバーのバリデーションで同値を共有する。
export const MAX_MONTHS = 240
export const MAX_ENTRIES_PER_MONTH = 50
export const MAX_ENTRY_NAME_LENGTH = 100
/** 金額は 0 以上の整数（円）。 */
export const MAX_ENTRY_AMOUNT = 1_000_000_000
