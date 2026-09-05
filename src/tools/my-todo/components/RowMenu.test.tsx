import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RowMenu } from './RowMenu'

const renderMenu = (onClick = vi.fn()) => {
  render(
    <RowMenu
      items={[
        { key: 'a', label: 'アクションA', onClick },
        { key: 'b', label: 'アクションB', onClick: vi.fn() },
      ]}
    />,
  )
  return { onClick }
}

describe('RowMenu', () => {
  afterEach(() => {
    cleanup()
  })

  it('is closed by default and opens the menu when the trigger is clicked', () => {
    renderMenu()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: '操作メニュー' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'アクションA' })).toBeInTheDocument()
  })

  it('runs the item action and closes the menu when a menu item is clicked', () => {
    const { onClick } = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: '操作メニュー' }))

    fireEvent.click(screen.getByRole('menuitem', { name: 'アクションA' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: '操作メニュー' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when clicking outside the menu', () => {
    render(
      <div>
        <RowMenu items={[{ key: 'a', label: 'アクションA', onClick: vi.fn() }]} />
        <button type="button">outside</button>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: '操作メニュー' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
