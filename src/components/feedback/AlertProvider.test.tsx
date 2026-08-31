import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, useAlert } from './AlertProvider'

const AlertTrigger = () => {
  const { showAlert } = useAlert()
  return (
    <div>
      <button type="button" onClick={() => showAlert('success', '保存しました')}>
        success
      </button>
      <button type="button" onClick={() => showAlert('error', '失敗しました')}>
        error
      </button>
      <button type="button" onClick={() => showAlert('info', 'お知らせ')}>
        info
      </button>
    </div>
  )
}

const renderTrigger = () =>
  render(
    <AlertProvider>
      <AlertTrigger />
    </AlertProvider>,
  )

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AlertProvider / useAlert', () => {
  it('shows a toast with the severity class when showAlert is called', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'success' }))

    const message = screen.getByText('保存しました')
    expect(message.closest('.fbk-alert')).toHaveClass('fbk-alert-success')
  })

  it('stacks multiple toasts shown at the same time', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'success' }))
    fireEvent.click(screen.getByRole('button', { name: 'error' }))

    expect(screen.getByText('保存しました')).toBeInTheDocument()
    expect(screen.getByText('失敗しました')).toBeInTheDocument()
  })

  it('keeps only the latest toasts up to the max (drops the oldest)', () => {
    render(
      <AlertProvider max={1}>
        <AlertTrigger />
      </AlertProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'success' }))
    fireEvent.click(screen.getByRole('button', { name: 'error' }))

    // max=1 なので古い success は消え、最新の error だけが残る
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
    expect(screen.getByText('失敗しました')).toBeInTheDocument()
  })

  it('removes a toast immediately when its close button is clicked', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'success' }))
    expect(screen.getByText('保存しました')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
  })

  it('auto-dismisses success/info toasts after 3000ms and error toasts after 5000ms', () => {
    vi.useFakeTimers()
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'info' }))
    fireEvent.click(screen.getByRole('button', { name: 'error' }))

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByText('お知らせ')).not.toBeInTheDocument()
    expect(screen.getByText('失敗しました')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByText('失敗しました')).not.toBeInTheDocument()
  })
})
