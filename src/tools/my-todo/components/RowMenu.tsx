import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreVertIcon } from './icons'

export type RowMenuItem = {
  key: string
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
  icon?: ReactNode
}

type RowMenuProps = {
  items: RowMenuItem[]
}

// 行の操作（移動・編集・削除）を1つの「⋯」に集約するオーバーフローメニュー。モバイルで
// タスクテキストの表示幅を確保するため、行に並んでいた個別ボタンをこれに置き換える。
export const RowMenu = ({ items }: RowMenuProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // 開いている間だけ外側クリック・Escape を監視する（閉じている行では何もしない＝
  // 行数ぶんのリスナーが常時張り付くのを避ける）。他行の「⋯」を開く操作は「外側クリック」に
  // 該当するため、これだけで「同時に開くのは1つ」を満たす（グローバルな開閉状態の共有は不要）。
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
    <div className="mytodo-row-menu-anchor" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="mytodo-more-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="操作メニュー"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertIcon />
      </button>

      {open ? (
        <div className="mytodo-row-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`mytodo-row-menu-item${item.danger ? ' mytodo-danger-button' : ''}`}
              disabled={item.disabled}
              title={item.title}
              onClick={() => handleItemClick(item)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
