import { useEffect, useState } from 'react'

const readStoredValue = <T,>(key: string, initialValue: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? (JSON.parse(raw) as T) : initialValue
  } catch {
    return initialValue
  }
}

export const usePersistedState = <T,>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // localStorage が使えない環境（プライベートモード等）では保存をあきらめる
    }
  }, [key, value])

  return [value, setValue] as const
}
