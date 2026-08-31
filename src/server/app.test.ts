import { describe, expect, it } from 'vitest'
import app from '../index'
import { createApp } from './app'
import type { Storage, StoredFileMeta } from './storage/index'
import type { PromptHistoryStorage, PromptWordStorage } from './prompt-storage/index'
import type { PromptCategoryId } from '../tools/prompt-builder/shared/categories'
import type { HistoryEntry, PromptWord } from '../tools/prompt-builder/shared/types'

const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

const withNodeEnv = async (value: string | undefined, run: () => Promise<void>) => {
  const previous = process.env.NODE_ENV
  try {
    if (value === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = value
    await run()
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
}

class InMemoryStorage implements Storage {
  private files = new Map<string, Uint8Array>()

  async list(): Promise<StoredFileMeta[]> {
    return [...this.files.keys()].sort().map((name) => ({ name, size: this.files.get(name)!.length, uploadedAt: new Date(0).toISOString() }))
  }

  async get(name: string): Promise<Uint8Array | null> {
    return this.files.get(name) ?? null
  }

  async put(name: string, bytes: Uint8Array): Promise<StoredFileMeta> {
    this.files.set(name, bytes)
    return { name, size: bytes.length, uploadedAt: new Date(0).toISOString() }
  }

  async delete(name: string): Promise<void> {
    this.files.delete(name)
  }
}

class InMemoryPromptStorage implements PromptWordStorage {
  private words = new Map<PromptCategoryId, PromptWord[]>()

  async getWords(category: PromptCategoryId): Promise<PromptWord[]> {
    return this.words.get(category) ?? []
  }

  async putWords(category: PromptCategoryId, words: PromptWord[]): Promise<PromptWord[]> {
    this.words.set(category, words)
    return words
  }
}

class InMemoryHistoryStorage implements PromptHistoryStorage {
  private entries = new Map<PromptCategoryId, HistoryEntry[]>()

  async getHistory(category: PromptCategoryId): Promise<HistoryEntry[]> {
    return this.entries.get(category) ?? []
  }

  async putHistory(category: PromptCategoryId, entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    this.entries.set(category, entries)
    return entries
  }
}

describe('server application', () => {
  it('serves the top hub page with links to each tool and the theme toggle script', async () => {
    const response = await request('/')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<title>Private Tools</title>')
    expect(html).toContain('href="/tools/credit-csv"')
    expect(html).toContain('href="/tools/prompt-builder"')
    expect(html).toContain('data-theme-toggle')
    expect(html).toContain('<script type="module" src="/src/ui/theme.ts"></script>')
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("style-src 'self'")
    expect(csp).not.toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('points the top page at the built theme script in production', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp().request('http://localhost/')
      const html = await response.text()

      expect(html).toContain('<script type="module" src="/assets/theme.js"></script>')
    })
  })

  it('does not add the theme script to the credit CSV tool shell', async () => {
    const response = await request('/tools/credit-csv')
    const html = await response.text()

    expect(html).not.toContain('theme.js')
    expect(html).not.toContain('theme.ts')
  })

  it('serves the credit CSV SSR shell for the tool root and deep links, relaxing style-src', async () => {
    for (const path of ['/tools/credit-csv', '/tools/credit-csv/yearly']) {
      const response = await request(path)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('id="root"')
      expect(html).toContain('src="/src/client.tsx"')
      // 開発では抽出済み /assets/client.css は存在しないためリンクしない（404 を避ける）
      expect(html).not.toContain('/assets/client.css')
      const csp = response.headers.get('content-security-policy')
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    }
  })

  it('links the built stylesheet in the credit CSV shell only in production', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp().request('http://localhost/tools/credit-csv')
      const html = await response.text()

      expect(html).toContain('src="/assets/client.js"')
      expect(html).toContain('href="/assets/client.css"')
    })
  })

  it('allows the Vite React Refresh inline preamble in script-src only in development', async () => {
    await withNodeEnv('development', async () => {
      const response = await createApp().request('http://localhost/')
      const csp = response.headers.get('content-security-policy')

      expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    })
  })

  it('mounts the credit CSV API under /tools/credit-csv/api', async () => {
    const storage = new InMemoryStorage()
    await storage.put('202401.csv', new Uint8Array([1, 2, 3]))
    const testApp = createApp({ creditCsvStorage: storage })

    const response = await testApp.request('http://localhost/tools/credit-csv/api/files')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { files: [{ name: '202401.csv', size: 3, uploadedAt: new Date(0).toISOString() }] },
    })
  })

  it('returns a JSON 404 for unknown routes under the credit CSV API', async () => {
    const testApp = createApp({ creditCsvStorage: new InMemoryStorage() })
    const response = await testApp.request('http://localhost/tools/credit-csv/api/missing')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Not found.' } })
  })

  it('serves the prompt builder SSR shell for the tool root and deep links, relaxing style-src', async () => {
    for (const path of ['/tools/prompt-builder', '/tools/prompt-builder/base-prompt']) {
      const response = await request(path)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('<title>Prompt Builder</title>')
      expect(html).toContain('id="root"')
      expect(html).toContain('src="/src/client-prompt.tsx"')
      expect(html).not.toContain('/assets/client-prompt.css')
      const csp = response.headers.get('content-security-policy')
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    }
  })

  it('links the built prompt builder assets only in production', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp().request('http://localhost/tools/prompt-builder')
      const html = await response.text()

      expect(html).toContain('src="/assets/client-prompt.js"')
      expect(html).toContain('href="/assets/client-prompt.css"')
    })
  })

  it('does not relax style-src for the top page or other routes', async () => {
    for (const path of ['/', '/missing']) {
      const response = await request(path)
      const csp = response.headers.get('content-security-policy')
      expect(csp).not.toContain("style-src 'self' 'unsafe-inline'")
    }
  })

  it('mounts the prompt word API under /tools/prompt-builder/api', async () => {
    // Inject in-memory storage so the test does not depend on the local .data/ filesystem.
    const testApp = createApp({
      promptWordStorage: new InMemoryPromptStorage(),
      promptHistoryStorage: new InMemoryHistoryStorage(),
    })
    const response = await testApp.request('http://localhost/tools/prompt-builder/api/words/base-prompt')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { words: [] } })
  })

  it('mounts the prompt history API under /tools/prompt-builder/api', async () => {
    const testApp = createApp({
      promptWordStorage: new InMemoryPromptStorage(),
      promptHistoryStorage: new InMemoryHistoryStorage(),
    })
    const response = await testApp.request('http://localhost/tools/prompt-builder/api/history/base-prompt')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { entries: [] } })
  })

  it('returns a JSON 404 for unknown routes under the prompt builder API', async () => {
    const testApp = createApp({
      promptWordStorage: new InMemoryPromptStorage(),
      promptHistoryStorage: new InMemoryHistoryStorage(),
    })
    const response = await testApp.request('http://localhost/tools/prompt-builder/api/missing')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Not found.' } })
  })

  it('serves the bundled client asset in production', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp({ assetOverrides: { 'client.js': 'console.log("bundle")' } }).request(
        'http://localhost/assets/client.js',
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/javascript')
      await expect(response.text()).resolves.toBe('console.log("bundle")')
    })
  })

  it('serves the extracted tool stylesheet in production', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp({ assetOverrides: { 'client.css': '.ccsv-app { color: red; }' } }).request(
        'http://localhost/assets/client.css',
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/css')
      await expect(response.text()).resolves.toBe('.ccsv-app { color: red; }')
    })
  })

  it('returns 404 for an asset that does not exist', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp().request('http://localhost/assets/does-not-exist.js')
      expect(response.status).toBe(404)
    })
  })

  it('rejects asset filenames outside the allowlist pattern, including path traversal attempts', async () => {
    await withNodeEnv('production', async () => {
      for (const path of ['/assets/..%2F..%2Fpackage.json', '/assets/%2e%2e%2fapp.ts', '/assets/sub/dir.js']) {
        const response = await createApp().request(`http://localhost${path}`)
        expect(response.status).toBe(404)
      }
    })
  })

  it('serves the stylesheet in production with its content type', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp({ stylesAsset: 'body { color: red; }' }).request('http://localhost/styles.css')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/css')
      await expect(response.text()).resolves.toBe('body { color: red; }')
    })
  })

  it('serves the default stylesheet from the module-relative asset path', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp().request('http://localhost/styles.css')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/css')
      await expect(response.text()).resolves.toContain('.top-shell')
    })
  })

  it('returns 404 when the bundled client asset is unavailable', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp({ assetOverrides: { 'client.js': null } }).request('http://localhost/assets/client.js')
      expect(response.status).toBe(404)
    })
  })

  it('does not serve static assets outside production', async () => {
    const response = await createApp({ assetOverrides: { 'client.js': 'console.log("bundle")' } }).request(
      'http://localhost/assets/client.js',
    )
    expect(response.status).toBe(404)
  })

  it('links the favicon from the top page and tool shells', async () => {
    for (const path of ['/', '/tools/credit-csv', '/tools/prompt-builder']) {
      const response = await request(path)
      const html = await response.text()
      expect(html).toContain('<link rel="icon" href="/favicon.ico"')
    }
  })

  it('serves the favicon from src/public in production', async () => {
    await withNodeEnv('production', async () => {
      const response = await createApp().request('http://localhost/favicon.ico')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('image/x-icon')
      const bytes = new Uint8Array(await response.arrayBuffer())
      // .ico magic: reserved(0x0000) + type 1 (icon)
      expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0, 0, 1, 0])
    })
  })

  it('does not serve the favicon route outside production', async () => {
    const response = await createApp().request('http://localhost/favicon.ico')
    // In dev the Vite middleware serves it; the Hono app itself returns HTML 404.
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  it('keeps API and HTML 404 responses separate', async () => {
    const [apiResponse, htmlResponse] = await Promise.all([
      request('/tools/credit-csv/api/missing'),
      request('/missing'),
    ])

    expect(apiResponse.status).toBe(404)
    await expect(apiResponse.json()).resolves.toEqual({ ok: false, error: { message: 'Not found.' } })
    expect(htmlResponse.status).toBe(404)
    expect(htmlResponse.headers.get('content-type')).toContain('text/html')
  })
})
