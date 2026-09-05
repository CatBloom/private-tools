import { useRef, useState, type ChangeEvent } from 'react'
import { useAlert, useConfirm } from '../../../components/feedback'
import { useAppDataContext } from '../state/AppDataContext'

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

const formatUploadedAt = (isoDate: string) => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export const FilesPage = () => {
  const { files, upload, remove } = useAppDataContext()
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()
  const sortedFiles = [...files].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsUploading(true)

    try {
      await upload(file)
      showAlert('success', `${file.name} をアップロードしました。`)
    } catch (error) {
      showAlert('error', error instanceof Error ? error.message : 'アップロードに失敗しました。')
    } finally {
      setIsUploading(false)
      // 同じファイルを選び直しても onChange が再発火するよう値をリセット
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (name: string) => {
    const confirmed = await confirm(`${name} を削除しますか？この操作は取り消せません。`, {
      title: '削除',
      danger: true,
    })
    if (!confirmed) return

    setPendingDelete(name)

    try {
      await remove(name)
      showAlert('success', `${name} を削除しました。`)
    } catch (error) {
      showAlert('error', error instanceof Error ? error.message : '削除に失敗しました。')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="credit-csv-page-stack">
      <section className="credit-csv-panel">
        <div className="credit-csv-panel-header">
          <h1>ファイル管理</h1>
        </div>
        <div className="credit-csv-upload-form">
          <div className="credit-csv-file-field">
            <input
              ref={inputRef}
              id="credit-csv-csv-input"
              className="credit-csv-file-input"
              type="file"
              accept=".csv"
              aria-label="CSVファイル"
              disabled={isUploading}
              onChange={handleFileChange}
            />
            <label htmlFor="credit-csv-csv-input" className="credit-csv-file-button" aria-disabled={isUploading}>
              ファイルを選択
            </label>
            <span className="credit-csv-file-name">
              {isUploading ? 'アップロード中…' : 'ファイルを選択すると自動でアップロードされます'}
            </span>
          </div>
        </div>
      </section>

      <section className="credit-csv-panel">
        <div className="credit-csv-panel-header">
          <h2>アップロード済みファイル</h2>
        </div>
        <div className="credit-csv-table-wrap">
          <table className="credit-csv-files-table">
            <colgroup>
              <col className="credit-csv-fcol-date" />
              <col className="credit-csv-fcol-name" />
              <col className="credit-csv-fcol-size" />
              <col className="credit-csv-fcol-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>アップロード日時</th>
                <th>ファイル名</th>
                <th>サイズ</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => (
                <tr key={file.name}>
                  <td>{formatUploadedAt(file.uploadedAt)}</td>
                  <td>{file.name}</td>
                  <td>{formatFileSize(file.size)}</td>
                  <td>
                    <button
                      type="button"
                      className="credit-csv-icon-button"
                      aria-label="削除"
                      title="削除"
                      disabled={pendingDelete === file.name}
                      onClick={() => handleDelete(file.name)}
                    >
                      <svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {files.length === 0 ? (
                <tr>
                  <td colSpan={4}>アップロード済みの CSV はありません。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
