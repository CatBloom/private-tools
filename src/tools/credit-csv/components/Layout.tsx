import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTheme } from '../../../hooks/useTheme'
import { ThemeToggle } from '../../../components/ThemeToggle'

export const Layout = ({ children }: { children: ReactNode }) => {
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
    <div className="ccsv-app" data-theme={theme}>
      <div className="ccsv-layout">
        <header className="ccsv-topbar">
          <button
            className="ccsv-menu-button"
            type="button"
            aria-label="メニューを開く"
            aria-expanded={navOpen}
            aria-controls="ccsv-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>
          <span className="ccsv-topbar-brand">Credit CSV Viewer</span>
        </header>

        <div
          className={`ccsv-overlay${navOpen ? ' is-open' : ''}`}
          onClick={closeNav}
          aria-hidden="true"
        />

        <aside id="ccsv-sidebar" className={`ccsv-sidebar${navOpen ? ' is-open' : ''}`}>
          <a className="ccsv-back-link" href="/">
            ← ツール一覧
          </a>

          <div className="ccsv-sidebar-brand">
            <span className="ccsv-brand">Credit CSV Viewer</span>
          </div>

          <nav className="ccsv-nav-tabs">
            <NavLink to="/" end onClick={closeNav}>
              明細
            </NavLink>
            <NavLink to="/yearly" onClick={closeNav}>
              年間合計
            </NavLink>
            <NavLink to="/files" onClick={closeNav}>
              ファイル管理
            </NavLink>
          </nav>

          <ThemeToggle theme={theme} onToggle={toggle} />
        </aside>

        <main className="ccsv-main">{children}</main>
      </div>
    </div>
  )
}
