import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolHeader } from './ToolHeader'

afterEach(() => {
  cleanup()
})

describe('ToolHeader', () => {
  it('renders the title and a back link to the tool hub', () => {
    render(<ToolHeader title="Prompt Builder" />)

    expect(screen.getByText('Prompt Builder')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ツール一覧/ })).toHaveAttribute('href', '/')
  })

  it('renders children in the header actions area', () => {
    render(
      <ToolHeader title="Prompt Builder">
        <button type="button">テーマ切替</button>
      </ToolHeader>,
    )

    expect(screen.getByRole('button', { name: 'テーマ切替' })).toBeInTheDocument()
  })
})
