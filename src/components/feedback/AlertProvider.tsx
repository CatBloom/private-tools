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

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<AlertToast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showAlert = useCallback(
    (severity: AlertSeverity, message: string) => {
      const id = nextToastId++
      setToasts((current) => [...current, { id, severity, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS[severity]),
      )
    },
    [dismiss],
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
