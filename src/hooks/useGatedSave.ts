import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEFAULT_MIN_INTERVAL_MS = 1000

export type UseGatedSaveOptions<T> = {
  state: T
  stateRef: MutableRefObject<T>
  ready: boolean
  save: (state: T, options?: { keepalive?: boolean }) => Promise<unknown>
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
  const readyRef = useRef(ready)
  readyRef.current = ready

  const runSave = useCallback(
    (snapshot: T, options?: { keepalive?: boolean }) => {
      setSaveStatus('saving')
      setSaveError(null)
      lastWriteStartedAtRef.current = Date.now()
      // 通常経路（options 無し）は従来どおり1引数で呼ぶ。keepalive flush のときだけ第2引数を渡す。
      const request = options ? saveRef.current(snapshot, options) : saveRef.current(snapshot)
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

  // ゲート待ち（pendingTimer）の変更は、タイマー発火前にタブを閉じる・別ページへ遷移すると
  // 送られず失われるため、pagehide とアンマウント時に即時 keepalive 送信する（best-effort）。
  // in-flight 中なら完了を待ってから送る（useAutoSave.ts の flush と同じ直列化）。pagehide と
  // アンマウントが続けて起きるなど flush が重なった場合、両方とも同じ in-flight の完了を待って
  // send を呼ぶことがあるため、send の冒頭で in-flight の有無を再確認する：先に走った send が
  // 新しい送信を開始していれば、後の send は何もしない（その後の差分は runSave 自身の
  // 「完了後に stateRef と差分があれば再送する」仕組みに任せる）。
  const flush = useCallback(() => {
    const previous = inFlightRef.current
    const send = () => {
      if (!readyRef.current) return
      if (inFlightRef.current) return
      // in-flight の完了処理（成功時、stateRef との差分を見た再送）が新しい pendingTimer を
      // 作っていることがある（send はその完了を待ってから走るため）。消さずに keepalive 送信
      // すると、それが失敗した場合にこのタイマーが後から通常 PUT を再送してしまい、自動リトライ
      // しない契約に反する（アンマウント後にも走り得る）ため、送る前に必ず消す。
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
      const snapshot = stateRef.current
      if (snapshot === lastSentRef.current) return
      runSave(snapshot, { keepalive: true })
    }
    if (previous) {
      previous.catch(() => {}).then(send)
    } else {
      send()
    }
  }, [runSave, stateRef])

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

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
