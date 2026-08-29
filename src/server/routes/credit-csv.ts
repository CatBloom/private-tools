import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { selectStorage } from '../storage/index.js'
import type { Storage } from '../storage/index.js'
import { assertValidFileName } from '../storage/storage.js'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const isMultipartContentType = (contentType: string | undefined) =>
  contentType?.toLowerCase().split(';', 1)[0] === 'multipart/form-data'

const apiError = (message: string, status: 400 | 404 | 413 | 415) =>
  Response.json({ ok: false, error: { message } }, { status })

export const createCreditCsvRoutes = (storage: Storage = selectStorage()) => {
  const app = new Hono()

  app.get('/files', async (c) => {
    const files = await storage.list()
    return c.json({ ok: true, data: { files } })
  })

  app.post(
    '/files',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: () => apiError('Request body is too large.', 413),
    }),
    async (c) => {
      if (!isMultipartContentType(c.req.header('content-type'))) {
        return apiError('Unsupported media type.', 415)
      }

      let formData: FormData
      try {
        formData = await c.req.formData()
      } catch {
        return apiError('Invalid request.', 400)
      }

      const file = formData.get('file')
      if (!(file instanceof File)) {
        return apiError('Invalid request.', 400)
      }

      try {
        assertValidFileName(file.name)
      } catch {
        return apiError('Invalid file name.', 400)
      }

      const bytes = new Uint8Array(await file.arrayBuffer())
      const meta = await storage.put(file.name, bytes)
      return c.json({ ok: true, data: { file: meta } })
    },
  )

  app.get('/files/:name', async (c) => {
    const name = c.req.param('name')
    try {
      assertValidFileName(name)
    } catch {
      return apiError('Invalid file name.', 400)
    }

    const bytes = await storage.get(name)
    if (bytes === null) {
      return apiError('Not found.', 404)
    }

    return c.body(new Uint8Array(bytes), 200, { 'Content-Type': 'text/csv; charset=shift_jis' })
  })

  app.delete('/files/:name', async (c) => {
    const name = c.req.param('name')
    try {
      assertValidFileName(name)
    } catch {
      return apiError('Invalid file name.', 400)
    }

    await storage.delete(name)
    return c.json({ ok: true, data: { deleted: name } })
  })

  app.notFound((c) => c.json({ ok: false, error: { message: 'Not found.' } }, 404))

  return app
}
