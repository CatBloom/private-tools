import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type SaveOutcome = 'saved' | 'superseded' | 'error'

const DEFAULT_ERROR_MESSAGE = '保存に失敗しました。'

export type UseAutoSaveOptions<T> = {
  value: T
  dirty: boolean
  delayMs: number
  save: (snapshot: T, options: { keepalive?: boolean }) => Promise<unknown>
  onSaved: (snapshot: T) => void
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export type UseAutoSaveResult = {
  saveNow: () => Promise<SaveOutcome>
  resetStatus: () => void
  status: SaveStatus
  error: string | null
}

// value は参照比較で「送信中に変わったか」を判定するため、呼び出し側は編集のたびに新しい参照を渡すこと。
export const useAutoSave = <T,>({ value, dirty, delayMs, save, onSaved, onSuccess, onError }: UseAutoSaveOptions<T>): UseAutoSaveResult => {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const valueRef = useRef(value)
  valueRef.current = value
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const lastSentRef = useRef<T | null>(null)
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  // 呼び出し側が毎レンダー新しい関数を渡しても performSave/saveNow を安定させるため ref 経由で読む。
  const callbacksRef = useRef({ save, onSaved, onSuccess, onError })
  callbacksRef.current = { save, onSaved, onSuccess, onError }

  const resetStatus = useCallback(() => {
    setStatus((current) => (current === 'saving' ? current : 'idle'))
  }, [])

  // 先行する request の完了を待ってから送る。待っている間に同じ snapshot が既に送信済みになっていたら
  // （先行 request 自身がそれだったなど）二重送信になるため送らない。
  const performSave = useCallback(async (snapshot: T, options?: { keepalive?: boolean }) => {
    const { save, onSaved } = callbacksRef.current
    const previous = inFlightRef.current
    const request = (previous ? previous.catch(() => {}) : Promise.resolve()).then(() => {
      if (lastSentRef.current === snapshot) return
      return save(snapshot, options ?? {})
    })
    inFlightRef.current = request
    try {
      await request
      lastSentRef.current = snapshot
      const matched = valueRef.current === snapshot
      if (matched) onSaved(snapshot)
      return matched
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null
    }
  }, [])

  // flush は performSave を直接使う（onSuccess はここでの成功だけに通知する）。
  const saveNow = useCallback(async (): Promise<SaveOutcome> => {
    const snapshot = valueRef.current
    setStatus('saving')
    setError(null)
    try {
      const matched = await performSave(snapshot)
      if (!matched) {
        setStatus('idle')
        return 'superseded'
      }
      setStatus('saved')
      callbacksRef.current.onSuccess?.()
      return 'saved'
    } catch (err) {
      setError(err instanceof Error ? err.message : DEFAULT_ERROR_MESSAGE)
      setStatus('error')
      callbacksRef.current.onError?.(err)
      return 'error'
    }
  }, [performSave])

  // 失敗後は自動リトライしない（呼び出し側が resetStatus で再アームする）。
  useEffect(() => {
    if (!dirty || status === 'saving' || status === 'error') return
    const timer = window.setTimeout(() => {
      if (valueRef.current === lastSentRef.current) return
      saveNow()
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [dirty, value, status, delayMs, saveNow])

  // performSave 自身が直列化するため、in-flight の有無を見ずに1回呼ぶだけでよい。
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && valueRef.current !== lastSentRef.current) {
        performSave(valueRef.current, { keepalive: true }).catch(() => {})
      }
    }

    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [performSave])

  return { saveNow, resetStatus, status, error }
}
