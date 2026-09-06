import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'

export type ApiErrorStatus = 400 | 404 | 413 | 415

export const apiError = (c: Context, status: ApiErrorStatus, message: string) =>
  c.json({ ok: false, error: { message } }, status)

export const apiOk = <T>(c: Context, data: T) => c.json({ ok: true, data })

export const notFoundJson = (c: Context) => apiError(c, 404, 'Not found.')

// PUT ハンドラ共通のボディサイズ制限。onError は apiError と同じ形式で 413 を返す。
export const jsonBodyLimit = (maxBytes: number) =>
  bodyLimit({
    maxSize: maxBytes,
    onError: (c) => apiError(c, 413, 'Request body is too large.'),
  })

// content-type 検証 → JSON parse までの共通処理。ペイロードの型検証・サイズ超過時の
// メッセージはツールごとに異なるため呼び出し元で行う。
export const readJsonBody = async (
  c: Context,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> => {
  const contentType = c.req.header('content-type')?.toLowerCase().split(';', 1)[0]
  if (contentType !== 'application/json') {
    return { ok: false, response: apiError(c, 415, 'Unsupported media type.') }
  }

  try {
    return { ok: true, value: await c.req.json() }
  } catch {
    return { ok: false, response: apiError(c, 400, 'Invalid request.') }
  }
}
