import type { TodoState } from '../shared/types'

// タイムゾーンをまたぐ比較を避けるため toISOString ではなくローカルの年月日から組み立てる。
export const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// lastRolloverDate が null（初回起動）は日付を記録するだけでアイテムは動かさない
// （いきなり登録済みタスクを全部 Someday に流すと驚きが大きいため）。
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
