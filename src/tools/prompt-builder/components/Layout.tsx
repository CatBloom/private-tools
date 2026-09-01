import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PROMPT_CATEGORY_IDS, PROMPT_CATEGORY_LABELS } from '../shared/categories'
import { useTheme } from '../hooks/useTheme'
import { ThemeToggle } from './ThemeToggle'

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
    <div className="pbuilder-app" data-theme={theme}>
      <div className="pbuilder-layout">
        <header className="pbuilder-topbar">
          <button
            className="pbuilder-menu-button"
            type="button"
            aria-label="メニューを開く"
            aria-expanded={navOpen}
            aria-controls="pbuilder-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>
          <span className="pbuilder-topbar-brand">Prompt Builder</span>
        </header>

        <div
          className={`pbuilder-overlay${navOpen ? ' is-open' : ''}`}
          onClick={closeNav}
          aria-hidden="true"
        />

        <aside id="pbuilder-sidebar" className={`pbuilder-sidebar${navOpen ? ' is-open' : ''}`}>
          <a className="pbuilder-back-link" href="/">
            ← ツール一覧
          </a>

          <div className="pbuilder-sidebar-brand">
            <span className="pbuilder-brand">Prompt Builder</span>
          </div>

          <nav className="pbuilder-nav-tabs">
            {PROMPT_CATEGORY_IDS.map((category) => (
              <NavLink key={category} to={`/${category}`} onClick={closeNav}>
                {PROMPT_CATEGORY_LABELS[category]}
              </NavLink>
            ))}
          </nav>

          <ThemeToggle theme={theme} onToggle={toggle} />
        </aside>

        <main className="pbuilder-main">{children}</main>
      </div>
    </div>
  )
}
