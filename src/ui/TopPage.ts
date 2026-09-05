import { createElement } from 'react'
import { TOOLS } from '../tools/registry.js'

// Vercel のサーバービルドは import 指定子 '../ui/TopPage.js' を .ts には解決できるが .tsx には
// 解決できないため、SSR で使うこのコンポーネントは JSX を使わず createElement の .ts で実装する。
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
          'aria-label': 'テーマ切替',
        },
        'ダーク',
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
