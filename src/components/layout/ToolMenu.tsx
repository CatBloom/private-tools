import { NavLink } from 'react-router-dom'
import type { Theme } from '../../hooks/useTheme'
import { TOOLS, type ToolId } from '../../tools/registry'
import { ThemeToggle } from '../ThemeToggle'

// 全ツール共通の左ドロワーメニュー本体（ToolLayout.tsx から使う）。上から
// (1) そのツールの機能ナビ（registry の nav）、(2) 区切り、(3) 他ツールへの導線（registry から
// 自ツールを除いた一覧）、(4) 「← ツール一覧」、(5) テーマ切替の順に並べる。
// スタイルは src/public/styles.css の `.tool-layout-*`（ツール別バンドルの CSS はシェルが
// link しないため、常時 link される styles.css に置く）。
// 閉じている間は `inert` を付け、非表示のドロワー内リンクへキーボード/スクリーンリーダーの
// フォーカスが移らないようにする（`aria-hidden` だとフォーカス可能要素を隠すだけで tab 移動を
// 防げず、フォーカスされた要素を隠すのはアクセシビリティ違反になるため）。
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
      <nav className="tool-layout-nav" aria-label="ツール内ナビゲーション">
        {tool.nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onNavigate}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <hr className="tool-layout-divider" />

      <div className="tool-layout-others">
        <span className="tool-layout-others-heading">他のツール</span>
        {otherTools.map((other) => (
          <a key={other.id} href={other.path}>
            {other.name}
          </a>
        ))}
      </div>

      <a className="tool-layout-back-link" href="/">
        ← ツール一覧
      </a>

      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </aside>
  )
}
