import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { TOOLS, type ToolId } from '../../tools/registry'
import { ToolMenu } from './ToolMenu'
import { ToolTabs } from './ToolTabs'

// 全ツール共通のヘッダー＋左ドロワーメニュー＋本文レイアウト。機能ナビ・他ツールへの導線・
// 「ツール一覧」・テーマ切替はすべてドロワー（ToolMenu）側に集約する。
type ToolLayoutProps = {
  toolId: ToolId
  appClassName: string
  tabs?: boolean
  children: ReactNode
}

export const ToolLayout = ({ toolId, appClassName, tabs = false, children }: ToolLayoutProps) => {
  const tool = TOOLS.find((candidate) => candidate.id === toolId)!
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navOpen])

  const closeNav = () => setNavOpen(false)

  return (
    <div className={appClassName} data-theme={theme}>
      <div className="tool-layout">
        <header className="tool-layout-header">
          <button
            className="tool-layout-menu-button"
            type="button"
            aria-label="メニューを開く"
            aria-expanded={navOpen}
            aria-controls="tool-layout-menu"
            onClick={() => setNavOpen((current) => !current)}
          >
            ☰
          </button>
          <span className="tool-layout-title">{tool.name}</span>
        </header>

        <div
          className={`tool-layout-overlay${navOpen ? ' is-open' : ''}`}
          onClick={closeNav}
          aria-hidden="true"
        />

        <ToolMenu toolId={toolId} open={navOpen} theme={theme} onToggleTheme={toggle} onNavigate={closeNav} />

        {tabs && (
          <nav className="tool-layout-tabs" aria-label="ページ切替">
            <ToolTabs toolId={toolId} />
          </nav>
        )}

        <main className="tool-layout-main">{children}</main>
      </div>
    </div>
  )
}
