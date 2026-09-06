import { Hono } from 'hono'
import { selectCreditCsvStorage } from '../storage/credit-csv/index.js'
import type { CreditCsvStorage } from '../storage/credit-csv/index.js'
import { assertValidFileName } from '../storage/credit-csv/types.js'
import { apiError, apiOk, jsonBodyLimit, notFoundJson } from './shared.js'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const isMultipartContentType = (contentType: string | undefined) =>
  contentType?.toLowerCase().split(';', 1)[0] === 'multipart/form-data'

export const createCreditCsvRoutes = (storage: CreditCsvStorage = selectCreditCsvStorage()) => {
  const app = new Hono()

  app.get('/files', async (c) => {
    const files = await storage.list()
    return apiOk(c, { files })
  })

  app.post('/files', jsonBodyLimit(MAX_UPLOAD_BYTES), async (c) => {
    if (!isMultipartContentType(c.req.header('content-type'))) {
      return apiError(c, 415, 'Unsupported media type.')
    }

    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return apiError(c, 400, 'Invalid request.')
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return apiError(c, 400, 'Invalid request.')
    }

    try {
      assertValidFileName(file.name)
    } catch {
      return apiError(c, 400, 'Invalid file name.')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const meta = await storage.put(file.name, bytes)
    return apiOk(c, { file: meta })
  })

  app.get('/files/:name', async (c) => {
    const name = c.req.param('name')
    try {
      assertValidFileName(name)
    } catch {
      return apiError(c, 400, 'Invalid file name.')
    }

    const bytes = await storage.get(name)
    if (bytes === null) {
      return apiError(c, 404, 'Not found.')
    }

    return c.body(new Uint8Array(bytes), 200, { 'Content-Type': 'text/csv; charset=shift_jis' })
  })

  app.delete('/files/:name', async (c) => {
    const name = c.req.param('name')
    try {
      assertValidFileName(name)
    } catch {
      return apiError(c, 400, 'Invalid file name.')
    }

    await storage.delete(name)
    return apiOk(c, { deleted: name })
  })

  app.notFound(notFoundJson)

  return app
}
