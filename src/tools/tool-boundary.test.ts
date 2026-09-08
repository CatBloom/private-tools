import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// ツール同士は直接 import しない（横断ロジックは src/lib/<domain>/ に置く）。
// src/tools/<toolId>/ 配下の .ts/.tsx を走査し、相対 import/export/動的 import が
// 他ツールのディレクトリ（src/tools/<other>/）を指していないかを検証する。
// 加えて src/lib/ はツール非依存を保つため、src/tools/（registry.ts を含む）を import しない。
const toolsDir = resolve(__dirname)
const libDir = resolve(toolsDir, '..', 'lib')

const toolIds = readdirSync(toolsDir).filter((name) => statSync(join(toolsDir, name)).isDirectory())

const walkFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return walkFiles(fullPath)
    if (/\.(ts|tsx)$/.test(entry.name)) return [fullPath]
    return []
  })
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const specifierRe = /(?:import|export)[^'"()]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

const extractRelativeSpecifiers = (source: string): string[] => {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  const withoutComments = stripComments(source)
  while ((match = specifierRe.exec(withoutComments)) !== null) {
    const specifier = match[1] ?? match[2]
    if (specifier.startsWith('.')) specifiers.push(specifier)
  }
  return specifiers
}

describe('tool boundary', () => {
  for (const toolId of toolIds) {
    const toolDir = join(toolsDir, toolId)
    const files = walkFiles(toolDir)

    it(`src/tools/${toolId} does not import from another tool directory`, () => {
      const violations: string[] = []

      for (const file of files) {
        const specifiers = extractRelativeSpecifiers(readFileSync(file, 'utf8'))
        for (const specifier of specifiers) {
          const resolved = resolve(join(file, '..'), specifier)
          const other = toolIds.find((id) => id !== toolId && resolved.startsWith(join(toolsDir, id) + sep))
          if (other) violations.push(`${file} -> '${specifier}' (src/tools/${other})`)
        }
      }

      expect(violations).toEqual([])
    })
  }

  it('src/lib does not import from src/tools', () => {
    const violations: string[] = []

    for (const file of walkFiles(libDir)) {
      const specifiers = extractRelativeSpecifiers(readFileSync(file, 'utf8'))
      for (const specifier of specifiers) {
        const resolved = resolve(join(file, '..'), specifier)
        if (resolved === toolsDir || resolved.startsWith(toolsDir + sep)) {
          violations.push(`${file} -> '${specifier}'`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
