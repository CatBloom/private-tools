import { useEffect, useRef } from 'react'

const DEFAULT_MIN_INTERVAL_MS = 1000

export type UseRevalidateOnReturnOptions = {
  minIntervalMs?: number
}

// タブへ戻ったとき（visibilitychange の visible 化／window の focus）に callback を呼ぶ。
// 両イベントはほぼ同時に発火するため、直近の呼び出しから minIntervalMs 未満は間引く。
// callback は ref 経由で呼ぶので、呼び出し側が毎レンダー新しい関数を渡しても購読は貼り直さない。
export const useRevalidateOnReturn = (
  callback: () => void | Promise<void>,
  options?: UseRevalidateOnReturnOptions,
): void => {
  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const lastRunAtRef = useRef(0)

  useEffect(() => {
    const trigger = () => {
      const now = Date.now()
      if (now - lastRunAtRef.current < minIntervalMs) return
      lastRunAtRef.current = now
      callbackRef.current()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') trigger()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', trigger)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', trigger)
    }
  }, [minIntervalMs])
}
