import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ToolHeader } from '../../../components/layout/ToolHeader'
import { useTheme } from '../hooks/useTheme'
import { ThemeToggle } from './ThemeToggle'

export const Layout = ({ children }: { children: ReactNode }) => {
  const { theme, toggle } = useTheme()

  return (
    <div className="pbuilder-app" data-theme={theme}>
      <div className="pbuilder-layout">
        <ToolHeader title="Prompt Builder">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </ToolHeader>

        <nav className="pbuilder-tabs" aria-label="ページ切替">
          <NavLink to="/words" className={({ isActive }) => `pbuilder-tab-button${isActive ? ' is-active' : ''}`}>
            ワード
          </NavLink>
          <NavLink to="/output" className={({ isActive }) => `pbuilder-tab-button${isActive ? ' is-active' : ''}`}>
            出力
          </NavLink>
        </nav>

        <main className="pbuilder-main">{children}</main>
      </div>
    </div>
  )
}
