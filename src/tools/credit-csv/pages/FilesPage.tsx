import { useRef, useState, type ChangeEvent } from 'react'
import { useAppDataContext } from '../state/AppDataContext'

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

const formatUploadedAt = (isoDate: string) => {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString('ja-JP')
}

type FeedbackMessage = { kind: 'info' | 'error'; text: string }

export const FilesPage = () => {
  const { files, upload, remove } = useAppDataContext()
  // アップロード日の降順（最新が上）で表示する
  const sortedFiles = [...files].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [message, setMessage] = useState<FeedbackMessage | null>(null)

  // ファイルを選択した時点で自動アップロードする（アップロードボタンは廃止）
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsUploading(true)
    setMessage(null)

    try {
      await upload(file)
      setMessage({ kind: 'info', text: `${file.name} をアップロードしました。` })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'アップロードに失敗しました。' })
    } finally {
      setIsUploading(false)
      // 同じファイルを選び直しても onChange が再発火するよう値をリセットする
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm(`${name} を削除しますか？この操作は取り消せません。`)) {
      return
    }

    setPendingDelete(name)
    setMessage(null)

    try {
      await remove(name)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '削除に失敗しました。' })
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="ccsv-page-stack">
      <section className="ccsv-panel">
        <div className="ccsv-panel-header">
          <h1>ファイル管理</h1>
        </div>
        <div className="ccsv-upload-form">
          <div className="ccsv-file-field">
            <input
              ref={inputRef}
              id="ccsv-csv-input"
              className="ccsv-file-input"
              type="file"
              accept=".csv"
              aria-label="CSVファイル"
              disabled={isUploading}
              onChange={handleFileChange}
            />
            <label htmlFor="ccsv-csv-input" className="ccsv-file-button" aria-disabled={isUploading}>
              ファイルを選択
            </label>
            <span className="ccsv-file-name">
              {isUploading ? 'アップロード中…' : 'ファイルを選択すると自動でアップロードされます'}
            </span>
          </div>
        </div>
        {message ? (
          <p
            className={message.kind === 'error' ? 'ccsv-status-message ccsv-status-message-error' : 'ccsv-status-message'}
            role={message.kind === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="ccsv-panel">
        <div className="ccsv-panel-header">
          <h2>アップロード済みファイル</h2>
        </div>
        <div className="ccsv-table-wrap">
          <table className="ccsv-files-table">
            <colgroup>
              <col className="ccsv-fcol-date" />
              <col className="ccsv-fcol-name" />
              <col className="ccsv-fcol-size" />
              <col className="ccsv-fcol-actions" />
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
                  <td>{file.name.replace(/\.csv$/i, '')}</td>
                  <td>{formatFileSize(file.size)}</td>
                  <td>
                    <button
                      type="button"
                      className="ccsv-danger-button"
                      disabled={pendingDelete === file.name}
                      onClick={() => handleDelete(file.name)}
                    >
                      {pendingDelete === file.name ? '削除中…' : '削除'}
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
