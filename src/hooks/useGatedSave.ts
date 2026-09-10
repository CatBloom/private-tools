import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEFAULT_MIN_INTERVAL_MS = 1000

export type UseGatedSaveOptions<T> = {
  state: T
  stateRef: MutableRefObject<T>
  ready: boolean
  save: (state: T) => Promise<unknown>
  minIntervalMs?: number
  onError?: (message: string) => void
}

export type UseGatedSaveResult<T> = {
  saveStatus: SaveStatus
  saveError: string | null
  scheduleSave: () => void
  // 未送信の変更（in-flight・保存待ちタイマー・送信済みスナップショットとの差分）があるか。
  hasPendingChanges: () => boolean
  // 送信を経ずに「このスナップショットは送信済み」として扱う（読み込み直後の空撃ち保存防止に使う）。
  markSynced: (state: T) => void
}

// KV の「同一キー1秒1回」制約を守るための保存ゲート。即時 PUT を基本としつつ、1秒未満の
// 連続変更はまとめて1回・in-flight 中の変更は完了後にもう一度だけ再送し、失敗時は自動リトライ
// しない（次の scheduleSave 呼び出しが再アームする）。My Todo / Bill Manager の両 Context で共有する。
export const useGatedSave = <T,>({
  state,
  stateRef,
  ready,
  save,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  onError,
}: UseGatedSaveOptions<T>): UseGatedSaveResult<T> => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // 直近で save に成功したスナップショット参照。同一参照なら差分無しとみなす（失敗時は更新しない）。
  const lastSentRef = useRef<T | null>(null)
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  const lastWriteStartedAtRef = useRef<number | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // scheduleSave は runSave より後に定義されるため useCallback の依存配列に直接書けない（TDZ）。ref 経由で呼ぶ。
  const scheduleSaveRef = useRef<() => void>(() => {})
  const saveRef = useRef(save)
  saveRef.current = save
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const runSave = useCallback(
    (snapshot: T) => {
      setSaveStatus('saving')
      setSaveError(null)
      lastWriteStartedAtRef.current = Date.now()
      const request = saveRef.current(snapshot)
      inFlightRef.current = request
      request.then(
        () => {
          lastSentRef.current = snapshot
          inFlightRef.current = null
          if (stateRef.current !== snapshot) {
            // 通信中にさらに変更があった。scheduleSave 経由でもう一度だけ送る。
            scheduleSaveRef.current()
          } else {
            setSaveStatus('saved')
          }
        },
        (error: unknown) => {
          inFlightRef.current = null
          const message = error instanceof Error ? error.message : '保存に失敗しました。'
          setSaveError(message)
          setSaveStatus('error')
          onErrorRef.current?.(message)
        },
      )
    },
    [stateRef],
  )

  // 保存の唯一のエントリポイント。in-flight 中・差分無しなら何もしない。
  const scheduleSave = useCallback(() => {
    if (inFlightRef.current) return
    const snapshot = stateRef.current
    if (snapshot === lastSentRef.current) return

    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }

    const elapsed = lastWriteStartedAtRef.current === null ? Infinity : Date.now() - lastWriteStartedAtRef.current
    const delay = Math.max(0, minIntervalMs - elapsed)

    if (delay <= 0) {
      runSave(snapshot)
      return
    }

    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null
      scheduleSave()
    }, delay)
  }, [runSave, stateRef, minIntervalMs])
  scheduleSaveRef.current = scheduleSave

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    scheduleSave()
  }, [state, ready, scheduleSave])

  const hasPendingChanges = useCallback(() => {
    if (inFlightRef.current) return true
    if (pendingTimerRef.current !== null) return true
    return stateRef.current !== lastSentRef.current
  }, [stateRef])

  const markSynced = useCallback((snapshot: T) => {
    lastSentRef.current = snapshot
  }, [])

  return { saveStatus, saveError, scheduleSave, hasPendingChanges, markSynced }
}
