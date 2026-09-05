import { createElement } from 'react'
import { DARK_MODE_ICON_PATH, ICON_VIEW_BOX, LIGHT_MODE_ICON_PATH } from '../components/icon-paths.js'
import { themeToggleLabel } from '../lib/theme-labels.js'
import { TOOLS } from '../tools/registry.js'

// Vercel のサーバービルドは import 指定子 '../ui/TopPage.js' を .ts には解決できるが .tsx には
// 解決できないため、SSR で使うこのコンポーネントは JSX を使わず createElement の .ts で実装する。
const themeToggleIcon = (path: string, iconClassName: string) =>
  createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: ICON_VIEW_BOX,
      width: 24,
      height: 24,
      fill: 'currentColor',
      className: iconClassName,
      'aria-hidden': true,
    },
    createElement('path', { d: path }),
  )

export const TopPage = () =>
  createElement(
    'main',
    { className: 'top-shell' },
    createElement(
      'header',
      { className: 'top-header' },
      createElement('p', { className: 'top-eyebrow' }, 'Private Tools'),
      createElement(
        'button',
        {
          type: 'button',
          className: 'top-theme-toggle',
          'data-theme-toggle': true,
          // theme.ts が data-theme を検出するまでの一瞬はライト前提（dark_mode を規定表示）。
          'aria-label': themeToggleLabel('light'),
          title: themeToggleLabel('light'),
        },
        themeToggleIcon(DARK_MODE_ICON_PATH, 'icon-dark'),
        themeToggleIcon(LIGHT_MODE_ICON_PATH, 'icon-light'),
      ),
    ),
    createElement(
      'ul',
      { className: 'top-tool-list' },
      ...TOOLS.map((tool) =>
        createElement(
          'li',
          { key: tool.id },
          createElement(
            'a',
            { className: 'top-tool-card', href: tool.path },
            createElement('span', { className: 'top-tool-name' }, tool.name),
            createElement('span', { className: 'top-tool-desc' }, tool.description),
          ),
        ),
      ),
    ),
  )
