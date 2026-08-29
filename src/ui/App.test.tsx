import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('submits the name and announces a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true, data: { message: 'Hello, Ada!' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.change(screen.getByLabelText('お名前'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'あいさつする' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/hello', expect.objectContaining({ method: 'POST' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Hello, Ada!')
  })

  it('shows a safe failure response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')))
    render(<App />)

    fireEvent.change(screen.getByLabelText('お名前'), { target: { value: 'Ada' } })
    fireEvent.submit(screen.getByRole('button', { name: 'あいさつする' }).closest('form')!)

    expect(await screen.findByRole('status')).toHaveTextContent('通信状態を確認してください')
  })

  it('prevents duplicate submissions while a request is in progress', () => {
    let resolveRequest: (value: unknown) => void = () => undefined
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.change(screen.getByLabelText('お名前'), { target: { value: 'Ada' } })
    const button = screen.getByRole('button', { name: 'あいさつする' })
    fireEvent.click(button)
    fireEvent.submit(button.closest('form')!)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button')).toBeDisabled()
    resolveRequest({ json: () => Promise.resolve({ ok: true, data: { message: 'Hello, Ada!' } }) })
  })
})
