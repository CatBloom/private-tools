import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { deleteFile, fetchFileBytes, listFiles, uploadFile, type FileMeta } from '../api'
import { buildAppData } from '../lib/csv'
import type { AppData } from '../lib/types'

export type DataStatus =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: AppData }

type AppDataContextValue = {
  status: DataStatus
  files: FileMeta[]
  refresh: () => Promise<void>
  upload: (file: File) => Promise<void>
  remove: (name: string) => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'CSV の読み込みに失敗しました。'

export const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<DataStatus>({ kind: 'loading' })
  const [files, setFiles] = useState<FileMeta[]>([])

  const refresh = useCallback(async () => {
    setStatus({ kind: 'loading' })

    try {
      const fileList = await listFiles()
      setFiles(fileList)

      if (fileList.length === 0) {
        setStatus({ kind: 'empty' })
        return
      }

      const byteFiles = await Promise.all(
        fileList.map(async (meta) => ({
          fileName: meta.name,
          bytes: await fetchFileBytes(meta.name)
        }))
      )
      setStatus({ kind: 'ready', data: buildAppData(byteFiles) })
    } catch (error) {
      setStatus({ kind: 'error', message: toErrorMessage(error) })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upload = useCallback(
    async (file: File) => {
      await uploadFile(file)
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (name: string) => {
      await deleteFile(name)
      await refresh()
    },
    [refresh]
  )

  const value = useMemo<AppDataContextValue>(
    () => ({ status, files, refresh, upload, remove }),
    [status, files, refresh, upload, remove]
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export const useAppDataContext = () => {
  const context = useContext(AppDataContext)

  if (!context) {
    throw new Error('useAppDataContext must be used within AppDataProvider')
  }

  return context
}
