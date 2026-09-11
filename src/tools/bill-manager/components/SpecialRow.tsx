import { formatYen } from '../lib/format'
import type { SpecialExpense } from '../shared/types'

type SpecialRowProps = {
  special: SpecialExpense
  editable: boolean
  onDelete: () => void
}

// 特殊費用は金額とメモだけの軽い記録。一覧は編集メニューを持たず削除のみできる。
// editable=false（翌々月以降）は削除ボタン自体を出さない。
export const SpecialRow = ({ special, editable, onDelete }: SpecialRowProps) => (
  <li className="bill-manager-special-row">
    <span className="bill-manager-special-amount">{formatYen(special.amount)}</span>
    <span className="bill-manager-special-memo">{special.memo}</span>
    {editable ? (
      <button
        type="button"
        className="pt-button-danger bill-manager-special-delete"
        aria-label="この特殊費用を削除"
        onClick={onDelete}
      >
        ✕
      </button>
    ) : null}
  </li>
)
