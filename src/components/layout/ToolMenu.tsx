import { NavLink } from 'react-router-dom'
import type { Theme } from '../../hooks/useTheme'
import { TOOLS, type ToolId } from '../../tools/registry'
import { ThemeToggle } from '../ThemeToggle'

// 閉じている間は `inert` を付ける（`aria-hidden` はフォーカス可能要素の tab 移動を防げず、
// フォーカスされた要素を隠すのはアクセシビリティ違反になるため）。
type ToolMenuProps = {
  toolId: ToolId
  open: boolean
  theme: Theme
  onToggleTheme: () => void
  onNavigate: () => void
}

export const ToolMenu = ({ toolId, open, theme, onToggleTheme, onNavigate }: ToolMenuProps) => {
  const tool = TOOLS.find((candidate) => candidate.id === toolId)!
  const otherTools = TOOLS.filter((candidate) => candidate.id !== toolId)

  return (
    <aside id="tool-layout-menu" className={`tool-layout-menu${open ? ' is-open' : ''}`} inert={!open}>
      <div className="tool-layout-nav-group">
        <span className="tool-layout-others-heading">{tool.name}</span>
        <nav className="tool-layout-nav" aria-label="ツール内ナビゲーション">
          {tool.nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onNavigate}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <hr className="tool-layout-divider" />

      <div className="tool-layout-others">
        <span className="tool-layout-others-heading">他のツール</span>
        {otherTools.map((other) => (
          <a key={other.id} href={other.path}>
            {other.name}
          </a>
        ))}
      </div>

      <div className="tool-layout-menu-actions">
        <a className="tool-layout-back-link pt-button" href="/">
          ← ツール一覧
        </a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </aside>
  )
}
