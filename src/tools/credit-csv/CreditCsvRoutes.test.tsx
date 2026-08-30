import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { CreditCsvRoutes } from './CreditCsvRoutes'
import { formatCurrency } from './lib/format'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Line: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null
}))

type StoredFile = { name: string; size: number; uploadedAt: string; bytes: Uint8Array<ArrayBuffer> }

const textToBytes = (text: string) => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index)
  }
  return bytes
}

const APRIL_CSV = textToBytes(
  ['2026/04/05,AMAZON,1500', '2026/04/10,NETFLIX,2000', '2026/04/15,AMAZON,700'].join('\r\n') + '\r\n'
)

const MAY_CSV = textToBytes(['2026/05/01,SPOTIFY,1000'].join('\r\n') + '\r\n')

// jsdom の File/Blob は arrayBuffer() 等の中身読み出しを実装していないため、
// アップロードされたファイル名から既知のバイト列を引く（実ブラウザでは file.arrayBuffer() で読める）
const KNOWN_UPLOAD_BYTES: Record<string, Uint8Array<ArrayBuffer>> = {
  '202605.csv': MAY_CSV
}

const API_FILES_URL = '/tools/credit-csv/api/files'

let store: StoredFile[]

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const handleFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  const method = (init?.method ?? 'GET').toUpperCase()

  if (url === API_FILES_URL && method === 'GET') {
    return jsonResponse({
      ok: true,
      data: { files: store.map((entry) => ({ name: entry.name, size: entry.size, uploadedAt: entry.uploadedAt })) }
    })
  }

  if (url === API_FILES_URL && method === 'POST') {
    const formData = init?.body as FormData
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return jsonResponse({ ok: false, error: { message: 'Invalid request.' } }, 400)
    }

    const bytes = KNOWN_UPLOAD_BYTES[file.name] ?? new Uint8Array(0)
    const meta = { name: file.name, size: bytes.byteLength, uploadedAt: '2026-05-01T00:00:00.000Z' }
    store = [...store.filter((entry) => entry.name !== file.name), { ...meta, bytes }]
    return jsonResponse({ ok: true, data: { file: meta } })
  }

  const fileMatch = url.match(/^\/tools\/credit-csv\/api\/files\/(.+)$/)

  if (fileMatch) {
    const name = decodeURIComponent(fileMatch[1])

    if (method === 'GET') {
      const found = store.find((entry) => entry.name === name)
      if (!found) return jsonResponse({ ok: false, error: { message: 'Not found.' } }, 404)
      return new Response(found.bytes, { status: 200 })
    }

    if (method === 'DELETE') {
      store = store.filter((entry) => entry.name !== name)
      return jsonResponse({ ok: true, data: { deleted: name } })
    }
  }

  throw new Error(`unhandled request: ${method} ${url}`)
}

const renderApp = (initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreditCsvRoutes />
    </MemoryRouter>
  )

beforeEach(() => {
  localStorage.clear()
  store = [
    { name: '202604.csv', size: APRIL_CSV.byteLength, uploadedAt: '2026-04-01T00:00:00.000Z', bytes: APRIL_CSV }
  ]
  vi.stubGlobal('fetch', vi.fn(handleFetch))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CreditCsvRoutes', () => {
  it('shows an empty-state message when there are no uploaded files', async () => {
    store = []
    renderApp()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('アップロードされていません'))
  })

  it('renders parsed transactions and the period total for the uploaded file', async () => {
    renderApp()

    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('AMAZON')).toHaveLength(2)
    expect(within(table).getByText('NETFLIX')).toBeInTheDocument()
    expect(screen.getByText(formatCurrency(4200))).toBeInTheDocument()
  })

  it('sorts the transaction table by amount ascending and descending', async () => {
    renderApp()
    const table = await screen.findByRole('table')

    // 金額でソート（初回クリックは降順）: NETFLIX(2000) が先頭
    fireEvent.click(within(table).getByRole('button', { name: /金額/ }))
    let dataRows = within(table).getAllByRole('row').slice(1)
    expect(dataRows[0].textContent).toContain('NETFLIX')

    // もう一度クリックで昇順: NETFLIX(2000) が末尾
    fireEvent.click(within(table).getByRole('button', { name: /金額/ }))
    dataRows = within(table).getAllByRole('row').slice(1)
    expect(dataRows[dataRows.length - 1].textContent).toContain('NETFLIX')
  })

  it('switches to the monthly summary view and shows merchant totals', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))

    fireEvent.click(screen.getByRole('button', { name: '月内合計' }))

    const summaryTable = await screen.findByRole('table')
    expect(within(summaryTable).getByText('AMAZON')).toBeInTheDocument()
    expect(within(summaryTable).getByText(formatCurrency(2000))).toBeInTheDocument()
  })

  it('sorts the monthly summary table by count ascending and descending', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))
    fireEvent.click(screen.getByRole('button', { name: '月内合計' }))

    const table = await screen.findByRole('table')

    // 件数でソート（初回クリックは降順）: AMAZON(2件) が先頭
    fireEvent.click(within(table).getByRole('button', { name: /件数/ }))
    let dataRows = within(table).getAllByRole('row').slice(1)
    expect(dataRows[0].textContent).toContain('AMAZON')

    // もう一度クリックで昇順: NETFLIX(1件) が先頭
    fireEvent.click(within(table).getByRole('button', { name: /件数/ }))
    dataRows = within(table).getAllByRole('row').slice(1)
    expect(dataRows[0].textContent).toContain('NETFLIX')
  })

  it('filters transactions by a partial merchant name match', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))

    fireEvent.change(screen.getByLabelText('店名'), { target: { value: 'NETF' } })

    await waitFor(() => expect(screen.queryByText('AMAZON')).not.toBeInTheDocument())
    expect(screen.getAllByText('NETFLIX').length).toBeGreaterThan(0)
  })

  it('navigates to the yearly totals page', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))

    fireEvent.click(screen.getByRole('link', { name: '年間合計' }))

    expect(await screen.findByText('店名別累計')).toBeInTheDocument()
  })

  it('sorts the yearly merchant totals table by total amount ascending and descending', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))
    fireEvent.click(screen.getByRole('link', { name: '年間合計' }))

    const table = await screen.findByRole('table')

    // 既定は累計金額の降順: AMAZON(2200円) が先頭
    let dataRows = within(table).getAllByRole('row').slice(1)
    expect(dataRows[0].textContent).toContain('AMAZON')

    // クリックで昇順に反転: NETFLIX(2000円) が先頭
    fireEvent.click(within(table).getByRole('button', { name: /累計金額/ }))
    dataRows = within(table).getAllByRole('row').slice(1)
    expect(dataRows[0].textContent).toContain('NETFLIX')
  })

  it('uploads a new file through the files page and refreshes the list', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'ファイル管理' }))

    expect(await screen.findByText('202604')).toBeInTheDocument()

    const file = new File([MAY_CSV], '202605.csv', { type: 'text/csv' })
    // ファイル選択（change）だけで自動アップロードされる（アップロードボタンは廃止）
    fireEvent.change(screen.getByLabelText('CSVファイル'), { target: { files: [file] } })

    expect(await screen.findByText('202605')).toBeInTheDocument()
    expect(store.some((entry) => entry.name === '202605.csv')).toBe(true)
  })

  it('redirects unknown internal paths back to the detail page', async () => {
    renderApp('/does-not-exist')

    // 未知パスは "/"（明細）にリダイレクトされ、明細の合計が描画される
    expect(await screen.findByText(formatCurrency(4200))).toBeInTheDocument()
  })

  it('links back to the tool hub outside the SPA', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))

    const backLink = screen.getByRole('link', { name: /ツール一覧/ })
    expect(backLink).toHaveAttribute('href', '/')
  })

  it('toggles the mobile navigation drawer open state', async () => {
    renderApp()
    await screen.findByText(formatCurrency(4200))

    const menuButton = screen.getByRole('button', { name: 'メニューを開く' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('deletes a file through the files page', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'ファイル管理' }))

    const row = (await screen.findByText('202604')).closest('tr')
    expect(row).not.toBeNull()

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(screen.queryByText('202604')).not.toBeInTheDocument())
    expect(store).toHaveLength(0)
  })

  it('does not delete when the confirmation dialog is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'ファイル管理' }))

    const row = (await screen.findByText('202604')).closest('tr')
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '削除' }))

    // キャンセル時は削除されない
    expect(screen.getByText('202604')).toBeInTheDocument()
    expect(store).toHaveLength(1)
  })
})
