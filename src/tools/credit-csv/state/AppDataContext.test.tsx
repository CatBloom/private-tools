import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider, useAppDataContext } from './AppDataContext'

const { listFilesMock, fetchFileBytesMock, uploadFileMock, deleteFileMock } = vi.hoisted(() => ({
  listFilesMock: vi.fn(),
  fetchFileBytesMock: vi.fn(),
  uploadFileMock: vi.fn(),
  deleteFileMock: vi.fn()
}))

vi.mock('../api', () => ({
  listFiles: listFilesMock,
  fetchFileBytes: fetchFileBytesMock,
  uploadFile: uploadFileMock,
  deleteFile: deleteFileMock
}))

const encodeAscii = (text: string): ArrayBuffer => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index)
  }
  return bytes.buffer
}

const Probe = () => {
  const { status, files } = useAppDataContext()

  return (
    <div>
      <span data-testid="status">{status.kind}</span>
      <span data-testid="message">{status.kind === 'error' ? status.message : ''}</span>
      <span data-testid="count">{status.kind === 'ready' ? status.data.transactions.length : files.length}</span>
    </div>
  )
}

beforeEach(() => {
  listFilesMock.mockReset()
  fetchFileBytesMock.mockReset()
  uploadFileMock.mockReset()
  deleteFileMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('AppDataProvider', () => {
  it('reports an empty status when no files are uploaded', async () => {
    listFilesMock.mockResolvedValue([])

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('empty'))
  })

  it('builds AppData from the fetched file bytes', async () => {
    listFilesMock.mockResolvedValue([{ name: '202604.csv', size: 10, uploadedAt: '2026-04-01T00:00:00.000Z' }])
    fetchFileBytesMock.mockResolvedValue(encodeAscii('2026/04/05,STORE A,1500\r\n'))

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))
    expect(screen.getByTestId('count').textContent).toBe('1')
  })

  it('surfaces an error message when the file list cannot be loaded', async () => {
    listFilesMock.mockRejectedValue(new Error('network down'))

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
    expect(screen.getByTestId('message').textContent).toBe('network down')
  })

  it('surfaces an error when the CSV content cannot be parsed', async () => {
    listFilesMock.mockResolvedValue([{ name: '202604.csv', size: 10, uploadedAt: '2026-04-01T00:00:00.000Z' }])
    fetchFileBytesMock.mockResolvedValue(encodeAscii('not a transaction row\r\n'))

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
  })
})
