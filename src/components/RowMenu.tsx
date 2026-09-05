import { useEffect, useRef, useState } from 'react'

// 装飾用途のみなので aria-hidden・focusable="false" にし、意味は呼び出し側ボタンの aria-label で伝える。
const ExpandMoreIcon = () => (
  <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
  </svg>
)

export type RowMenuItem = {
  key: string
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
}

type RowMenuProps = {
  items: RowMenuItem[]
}

export const RowMenu = ({ items }: RowMenuProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // 開いている間だけ外側クリック・Escape を監視する（閉じている行にリスナーを張り続けない）。
  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleItemClick = (item: RowMenuItem) => {
    if (item.disabled) return
    setOpen(false)
    item.onClick()
  }

  return (
    <div className="row-menu-anchor" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="操作メニュー"
        onClick={() => setOpen((current) => !current)}
      >
        <ExpandMoreIcon />
      </button>

      {open ? (
        <div className="row-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`row-menu-item${item.danger ? ' pt-button-danger' : ''}`}
              disabled={item.disabled}
              title={item.title}
              onClick={() => handleItemClick(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
