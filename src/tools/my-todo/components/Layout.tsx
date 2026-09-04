import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ToolHeader } from '../../../components/layout/ToolHeader'
import { useTheme } from '../hooks/useTheme'
import { ThemeToggle } from './ThemeToggle'

export const Layout = ({ children }: { children: ReactNode }) => {
  const { theme, toggle } = useTheme()

  return (
    <div className="mytodo-app" data-theme={theme}>
      <div className="mytodo-layout">
        <ToolHeader title="MyTodo">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </ToolHeader>

        <nav className="mytodo-tabs" aria-label="ページ切替">
          <NavLink to="/today" className={({ isActive }) => `mytodo-tab-button${isActive ? ' is-active' : ''}`}>
            Today
          </NavLink>
          <NavLink to="/someday" className={({ isActive }) => `mytodo-tab-button${isActive ? ' is-active' : ''}`}>
            Someday
          </NavLink>
        </nav>

        <main className="mytodo-main">{children}</main>
      </div>
    </div>
  )
}
