import { createElement } from 'react'

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
      createElement(
        'li',
        null,
        createElement(
          'a',
          { className: 'top-tool-card', href: '/tools/credit-csv' },
          createElement('span', { className: 'top-tool-name' }, 'Credit CSV Viewer'),
          createElement('span', { className: 'top-tool-desc' }, 'クレジットカード利用明細CSVを集計・閲覧する'),
        ),
      ),
    ),
  )
