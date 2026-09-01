import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type AlertSeverity = 'success' | 'error' | 'info'

type AlertToast = { id: number; severity: AlertSeverity; message: string }

type AlertContextValue = {
  showAlert: (severity: AlertSeverity, message: string) => void
}

const AlertContext = createContext<AlertContextValue | null>(null)

const AUTO_DISMISS_MS: Record<AlertSeverity, number> = {
  success: 3000,
  info: 3000,
  error: 5000,
}

const SEVERITY_ICON: Record<AlertSeverity, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

let nextToastId = 0

// 同時に表示するトーストの上限（超えたら古いものから消す）。ツール側で変更可。
const DEFAULT_MAX_TOASTS = 3

export const AlertProvider = ({ children, max = DEFAULT_MAX_TOASTS }: { children: ReactNode; max?: number }) => {
  const [toasts, setToasts] = useState<AlertToast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id)
      setToasts((current) => current.filter((toast) => toast.id !== id))
    },
    [clearTimer],
  )

  const showAlert = useCallback(
    (severity: AlertSeverity, message: string) => {
      const id = nextToastId++
      setToasts((current) => {
        const next = [...current, { id, severity, message }]
        // 上限を超えたぶんは古いものから捨てる（タイマーも破棄する）
        while (next.length > Math.max(1, max)) {
          const removed = next.shift()
          if (removed) clearTimer(removed.id)
        }
        return next
      })
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS[severity]),
      )
    },
    [dismiss, clearTimer, max],
  )

  // アンマウント時に残っている全タイマーを確実に破棄する
  useEffect(() => {
    const timersMap = timers.current
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer))
      timersMap.clear()
    }
  }, [])

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <div className="fbk-alert-stack" role="region" aria-label="通知">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`fbk-alert fbk-alert-${toast.severity}`}
            role={toast.severity === 'error' ? 'alert' : 'status'}
          >
            <span className="fbk-alert-icon" aria-hidden="true">
              {SEVERITY_ICON[toast.severity]}
            </span>
            <span className="fbk-alert-message">{toast.message}</span>
            <button type="button" className="fbk-alert-close" aria-label="閉じる" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </AlertContext.Provider>
  )
}

export const useAlert = (): AlertContextValue => {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider')
  }
  return context
}
