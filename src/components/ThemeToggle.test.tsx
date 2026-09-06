import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

afterEach(() => {
  cleanup()
})

describe('ThemeToggle', () => {
  it('labels the button for switching to dark when the current theme is light', () => {
    render(<ThemeToggle theme="light" onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: 'ダークモードに切り替え' })).toBeInTheDocument()
  })

  it('labels the button for switching to light when the current theme is dark', () => {
    render(<ThemeToggle theme="dark" onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: 'ライトモードに切り替え' })).toBeInTheDocument()
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<ThemeToggle theme="light" onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'ダークモードに切り替え' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
