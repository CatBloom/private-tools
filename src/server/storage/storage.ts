export type StoredFileMeta = {
  name: string
  size: number
  uploadedAt: string
}

export interface Storage {
  list(): Promise<StoredFileMeta[]>
  get(name: string): Promise<Uint8Array | null>
  put(name: string, bytes: Uint8Array): Promise<StoredFileMeta>
  delete(name: string): Promise<void>
}

// File names are the only user-controlled input that reaches storage backends
// (local file paths, KV keys), so every implementation must validate through
// this pattern before touching a path or key — never interpolate a name that
// hasn't passed it.
export const FILE_NAME_PATTERN = /^\d{6}\.csv$/

export const isValidFileName = (name: string): boolean => FILE_NAME_PATTERN.test(name)

export const assertValidFileName = (name: string): void => {
  if (!isValidFileName(name)) {
    throw new Error(`Invalid CSV file name: ${name}`)
  }
}
