import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Spinner } from './Spinner'

afterEach(() => {
  cleanup()
})

describe('Spinner', () => {
  it('renders with a default status label', () => {
    render(<Spinner />)
    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
  })

  it('renders the given label text and uses it as the accessible name', () => {
    render(<Spinner label="送信中…" />)
    expect(screen.getByRole('status', { name: '送信中…' })).toBeInTheDocument()
    expect(screen.getByText('送信中…')).toBeInTheDocument()
  })
})
