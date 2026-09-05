import type { TodoState } from '../shared/types'

// マウント時に new Date() から呼び出し側で作る想定のローカル日付文字列（YYYY-MM-DD）。
// タイムゾーンをまたぐ比較を避けるため toISOString ではなくローカルの年月日から組み立てる。
export const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 日付が変わったときに1日1回だけ適用する繰り越し処理。
// - 同一日（lastRolloverDate === todayLocalDate）なら state をそのまま返す（変化なし）。
// - lastRolloverDate が null（初回起動）は日付を記録するだけでアイテムは動かさない。
//   初回起動でいきなり登録済みタスクを全部 Someday に流すと驚きが大きいための判断。
// - それ以外（日付が変わった）は、全セクションの完了済みアイテムを削除し、
//   Today に残っていた未完了アイテムを Someday の末尾へ移動する（Today は空になる）。
export const rollover = (state: TodoState, todayLocalDate: string): TodoState => {
  if (state.lastRolloverDate === todayLocalDate) return state

  if (state.lastRolloverDate === null) {
    return { ...state, lastRolloverDate: todayLocalDate }
  }

  const survivingSomeday = state.someday.filter((item) => !item.completed)
  const carriedOverFromToday = state.today.filter((item) => !item.completed)

  return {
    today: [],
    someday: [...survivingSomeday, ...carriedOverFromToday],
    lastRolloverDate: todayLocalDate,
  }
}
