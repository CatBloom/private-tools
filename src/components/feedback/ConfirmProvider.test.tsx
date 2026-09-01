import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { ConfirmProvider, useConfirm } from './ConfirmProvider'

const ConfirmTrigger = ({ danger = false }: { danger?: boolean }) => {
  const { confirm } = useConfirm()
  const [result, setResult] = useState<string>('')

  const handleClick = async () => {
    const confirmed = await confirm('本当に削除しますか？', { title: '確認', danger })
    setResult(confirmed ? 'confirmed' : 'cancelled')
  }

  return (
    <div>
      <button type="button" onClick={handleClick}>
        open
      </button>
      <output>{result}</output>
    </div>
  )
}

const renderTrigger = (danger = false) =>
  render(
    <ConfirmProvider>
      <ConfirmTrigger danger={danger} />
    </ConfirmProvider>,
  )

afterEach(() => {
  cleanup()
})

describe('ConfirmProvider / useConfirm', () => {
  it('resolves true when the confirm button is clicked', async () => {
    renderTrigger()
    fireEvent.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    expect(await screen.findByText('confirmed')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('resolves false when the cancel button is clicked', async () => {
    renderTrigger()
    fireEvent.click(screen.getByRole('button', { name: 'open' }))

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(await screen.findByText('cancelled')).toBeInTheDocument()
  })

  it('resolves false when the overlay is clicked outside the dialog', async () => {
    renderTrigger()
    fireEvent.click(screen.getByRole('button', { name: 'open' }))

    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(dialog.parentElement as HTMLElement)

    expect(await screen.findByText('cancelled')).toBeInTheDocument()
  })

  it('applies a danger class to the confirm button when danger is true', async () => {
    renderTrigger(true)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByRole('button', { name: 'OK' })).toHaveClass('fbk-confirm-confirm-danger')
  })
})
