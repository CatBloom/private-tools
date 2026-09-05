import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOLS } from './registry'

describe('tool registry', () => {
  it('has a unique id, path and entry name per tool', () => {
    const ids = TOOLS.map((tool) => tool.id)
    const paths = TOOLS.map((tool) => tool.path)
    const entryNames = TOOLS.map((tool) => tool.entry.name)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(paths).size).toBe(paths.length)
    expect(new Set(entryNames).size).toBe(entryNames.length)
  })

  it('derives the tool path from its id', () => {
    for (const tool of TOOLS) {
      expect(tool.path).toBe(`/tools/${tool.id}`)
    }
  })

  it('keeps clientScript/css consistent with the entry name', () => {
    for (const tool of TOOLS) {
      expect(tool.clientScript.dev).toBe(`/${tool.entry.src}`)
      expect(tool.clientScript.prod).toBe(`/assets/${tool.entry.name}.js`)
      expect(tool.css.prod).toBe(`/assets/${tool.entry.name}.css`)
    }
  })

  it('points entry.src at a file that exists on disk', () => {
    for (const tool of TOOLS) {
      expect(existsSync(resolve(tool.entry.src))).toBe(true)
    }
  })

  it('has at least one nav item, each with a path starting with /', () => {
    for (const tool of TOOLS) {
      expect(tool.nav.length).toBeGreaterThan(0)
      for (const item of tool.nav) {
        expect(item.to.startsWith('/')).toBe(true)
      }
    }
  })

  it('keeps the TOP card description short (fits on one line at 375px width)', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeLessThanOrEqual(20)
    }
  })
})
