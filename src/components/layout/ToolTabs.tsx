import { NavLink } from 'react-router-dom'
import { TOOLS, type ToolId } from '../../tools/registry'

// ドロワーを開かずに主要ページへ切り替えられるよう、機能ナビ（ToolMenu）とは別に本文上に併存させる。
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
