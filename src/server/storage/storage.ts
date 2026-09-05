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

// ファイル名はパス/KVキーに触れる唯一のユーザー入力。パストラバーサル対策として必ずこのパターンで検証する。
export const FILE_NAME_PATTERN = /^\d{6}\.csv$/

export const isValidFileName = (name: string): boolean => FILE_NAME_PATTERN.test(name)

export const assertValidFileName = (name: string): void => {
  if (!isValidFileName(name)) {
    throw new Error(`Invalid CSV file name: ${name}`)
  }
}
