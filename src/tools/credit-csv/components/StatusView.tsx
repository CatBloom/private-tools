import type { DataStatus } from '../state/AppDataContext'

export const StatusView = ({ status }: { status: DataStatus }) => {
  if (status.kind === 'loading') {
    return (
      <p className="ccsv-status-message" role="status">
        読み込み中です…
      </p>
    )
  }

  if (status.kind === 'empty') {
    return (
      <p className="ccsv-status-message" role="status">
        CSV がまだアップロードされていません。「ファイル管理」からアップロードしてください。
      </p>
    )
  }

  if (status.kind === 'error') {
    return (
      <p className="ccsv-status-message ccsv-status-message-error" role="alert">
        {status.message}
      </p>
    )
  }

  return null
}
