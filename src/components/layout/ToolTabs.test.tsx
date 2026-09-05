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

    expect(screen.getByRole('link', { name: 'ワード' })).toHaveAttribute('href', '/words')
    expect(screen.getByRole('link', { name: '出力' })).toHaveAttribute('href', '/output')
  })

  it('marks the tab matching the current location as active', () => {
    render(
      <MemoryRouter initialEntries={['/output']}>
        <ToolTabs toolId="prompt-builder" />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: '出力' })).toHaveClass('pt-tab', 'is-active')
    expect(screen.getByRole('link', { name: 'ワード' })).toHaveClass('pt-tab')
    expect(screen.getByRole('link', { name: 'ワード' })).not.toHaveClass('is-active')
  })
})
