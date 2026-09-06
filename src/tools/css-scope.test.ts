import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TOOLS } from './registry'

// ツール CSS の `.xxx-app a` のような「ラッパー＋素の要素セレクタ」は、ラッパー内に描画される共有 UI
// （ToolLayout / RowMenu / トースト等）にもカスケードで当たる。ツール固有クラスか本文コンテナ
// （.tool-layout-main）で限定されていることをテストで強制する。
const cssFiles = TOOLS.map((tool) => `src/tools/${tool.id}/${tool.id}.css`)

const extractSelectors = (css: string): string[] => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  const re = /([^{}]+)\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(withoutComments)) !== null) {
    const text = match[1].trim()
    if (text.startsWith('@')) continue
    for (const part of text.split(',')) selectors.push(part.trim())
  }
  return selectors
}

const isScopedToTool = (selector: string): boolean => {
  const appMatch = selector.match(/^\.([a-z-]+)-app(?![\w-])/)
  if (!appMatch) return true
  const rest = selector.slice(appMatch[0].length).trim()
  if (rest === '' || rest.startsWith(':') || rest.startsWith('[')) return true
  if (rest.includes('.tool-layout-main')) return true
  return rest.split(/\s*[\s>+~]\s*/).some((compound) => /[.#[]/.test(compound))
}

describe('tool CSS scoping', () => {
  for (const file of cssFiles) {
    it(`${file} does not style bare elements under the tool wrapper`, () => {
      const leaking = extractSelectors(readFileSync(file, 'utf8')).filter((selector) => !isScopedToTool(selector))
      expect(leaking).toEqual([])
    })
  }
})
