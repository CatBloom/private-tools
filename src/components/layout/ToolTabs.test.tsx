import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolTabs } from './ToolTabs'

afterEach(() => {
  cleanup()
})

describe('ToolTabs', () => {
  it('renders a tab per nav item with its link target', () => {
    render(
      <MemoryRouter initialEntries={['/words']}>
        <ToolTabs toolId="prompt-builder" />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'ワード一覧' })).toHaveAttribute('href', '/words')
    expect(screen.getByRole('link', { name: '登録' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('link', { name: '出力' })).toHaveAttribute('href', '/output')
  })

  it('marks the tab matching the current location as active', () => {
    render(
      <MemoryRouter initialEntries={['/output']}>
        <ToolTabs toolId="prompt-builder" />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: '出力' })).toHaveClass('pt-tab', 'is-active')
    expect(screen.getByRole('link', { name: 'ワード一覧' })).toHaveClass('pt-tab')
    expect(screen.getByRole('link', { name: 'ワード一覧' })).not.toHaveClass('is-active')
  })

  it('renders both full and short label spans for a nav item with shortLabel', () => {
    render(
      <MemoryRouter initialEntries={['/files']}>
        <ToolTabs toolId="credit-csv" />
      </MemoryRouter>
    )

    const tab = screen.getByRole('link', { name: 'ファイル管理' })
    expect(tab.querySelector('.tool-layout-tab-label-full')).toHaveTextContent('ファイル管理')
    expect(tab.querySelector('.tool-layout-tab-label-short')).toHaveTextContent('管理')
  })

  it('renders only the label for a nav item without shortLabel', () => {
    render(
      <MemoryRouter initialEntries={['/files']}>
        <ToolTabs toolId="credit-csv" />
      </MemoryRouter>
    )

    const tab = screen.getByRole('link', { name: '明細' })
    expect(tab.querySelector('.tool-layout-tab-label-full')).not.toBeInTheDocument()
    expect(tab.querySelector('.tool-layout-tab-label-short')).not.toBeInTheDocument()
    expect(tab).toHaveTextContent('明細')
  })
})
