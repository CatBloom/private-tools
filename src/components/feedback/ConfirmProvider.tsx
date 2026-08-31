import { createContext, useCallback, useContext, useEffect, useState, type MouseEvent, type ReactNode } from 'react'

export type ConfirmOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmState = {
  message: string
  options: ConfirmOptions
  resolve: (result: boolean) => void
}

type ConfirmContextValue = {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ConfirmState | null>(null)

  const settle = useCallback((result: boolean) => {
    setState((current) => {
      current?.resolve(result)
      return null
    })
  }, [])

  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        setState({ message, options, resolve })
      }),
    [],
  )

  useEffect(() => {
    if (!state) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state, settle])

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) settle(false)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state ? (
        <div className="fbk-confirm-overlay" onClick={handleOverlayClick}>
          <div
            className="fbk-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={state.options.title ?? state.message}
          >
            {state.options.title ? <h2 className="fbk-confirm-title">{state.options.title}</h2> : null}
            <p className="fbk-confirm-message">{state.message}</p>
            <div className="fbk-confirm-actions">
              <button type="button" className="fbk-confirm-cancel" onClick={() => settle(false)}>
                {state.options.cancelLabel ?? 'キャンセル'}
              </button>
              <button
                type="button"
                className={state.options.danger ? 'fbk-confirm-confirm fbk-confirm-confirm-danger' : 'fbk-confirm-confirm'}
                onClick={() => settle(true)}
              >
                {state.options.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = (): ConfirmContextValue => {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context
}
