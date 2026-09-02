import { readJson, writeJson } from '../../../lib/storage'
import type { OutputItem } from '../shared/types'

const OUTPUT_STORAGE_KEY = 'prompt-builder:output'

export const readOutputItems = (): OutputItem[] => readJson<OutputItem[]>(OUTPUT_STORAGE_KEY, [])

export const writeOutputItems = (items: OutputItem[]): void => {
  writeJson(OUTPUT_STORAGE_KEY, items)
}
