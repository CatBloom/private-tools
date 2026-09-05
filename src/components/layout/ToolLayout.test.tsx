import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolLayout } from './ToolLayout'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/words']}>
      <ToolLayout toolId="prompt-builder" appClassName="pbuilder-app">
        <p>本文</p>
      </ToolLayout>
    </MemoryRouter>
  )

describe('ToolLayout', () => {
  it('renders the tool name in the header and the body', () => {
    renderLayout()

    expect(screen.getByText('Prompt Builder')).toBeInTheDocument()
    expect(screen.getByText('本文')).toBeInTheDocument()
  })

  it('toggles the drawer menu open state via the menu button', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'メニューを開く' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the drawer when Escape is pressed', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'メニューを開く' })
    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the current tool feature nav', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: 'ワード' })).toHaveAttribute('href', '/words')
    expect(screen.getByRole('link', { name: '出力' })).toHaveAttribute('href', '/output')
  })

  it('lists the other tools but not the current one', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: 'Credit CSV Viewer' })).toHaveAttribute(
      'href',
      '/tools/credit-csv'
    )
    expect(screen.getByRole('link', { name: 'MyTodo' })).toHaveAttribute('href', '/tools/my-todo')
    expect(screen.queryByRole('link', { name: 'Prompt Builder' })).not.toBeInTheDocument()
  })

  it('renders the back-to-hub link and the theme toggle', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: /ツール一覧/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: /ダーク|ライト/ })).toBeInTheDocument()
  })
})
