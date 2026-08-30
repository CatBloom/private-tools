export type FileMeta = {
  name: string
  size: number
  uploadedAt: string
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

const API_BASE = '/tools/credit-csv/api'

const readResult = async <T>(response: Response): Promise<T> => {
  let body: ApiResult<T>
  try {
    body = (await response.json()) as ApiResult<T>
  } catch {
    throw new Error(`サーバーとの通信に失敗しました。(status: ${response.status})`)
  }

  if (!body.ok) {
    throw new Error(body.error.message)
  }

  return body.data
}

export const listFiles = async (): Promise<FileMeta[]> => {
  const response = await fetch(`${API_BASE}/files`)
  const data = await readResult<{ files: FileMeta[] }>(response)
  return data.files
}

export const uploadFile = async (file: File): Promise<FileMeta> => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/files`, { method: 'POST', body: formData })
  const data = await readResult<{ file: FileMeta }>(response)
  return data.file
}

export const deleteFile = async (name: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`, { method: 'DELETE' })
  await readResult<{ deleted: string }>(response)
}

export const fetchFileBytes = async (name: string): Promise<ArrayBuffer> => {
  const response = await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`)

  if (!response.ok) {
    throw new Error(`ファイルの取得に失敗しました: ${name}`)
  }

  return response.arrayBuffer()
}
