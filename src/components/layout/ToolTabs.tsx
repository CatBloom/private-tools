import { NavLink } from 'react-router-dom'
import { TOOLS, type ToolId } from '../../tools/registry'

// 本文上のページ切替タブ（ToolLayout の tabs prop から使う）。ドロワー内の機能ナビ
// （ToolMenu の .tool-layout-nav）と役割が重複するが、ドロワーを開かずに主要ページへ
// 即座に切り替えられるよう仕様として併存させる（旧 my-todo/prompt-builder の Layout.tsx が
// 持っていた `.mytodo-tabs`/`.pbuilder-tabs` の後継）。
type ToolTabsProps = {
  toolId: ToolId
}

export const ToolTabs = ({ toolId }: ToolTabsProps) => {
  const tool = TOOLS.find((candidate) => candidate.id === toolId)!

  return (
    <>
      {tool.nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `pt-tab${isActive ? ' is-active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  )
}
