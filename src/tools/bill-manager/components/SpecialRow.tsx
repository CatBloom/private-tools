import type { SpecialExpense } from '../shared/types'

const yenFormatter = new Intl.NumberFormat('ja-JP')

type SpecialRowProps = {
  special: SpecialExpense
  onDelete: () => void
}

// 特殊費用は金額とメモだけの軽い記録。一覧は編集メニューを持たず削除のみできる。
export const SpecialRow = ({ special, onDelete }: SpecialRowProps) => (
  <li className="bill-manager-special-row">
    <span className="bill-manager-special-amount">{yenFormatter.format(special.amount)}円</span>
    <span className="bill-manager-special-memo">{special.memo}</span>
    <button
      type="button"
      className="pt-button-danger bill-manager-special-delete"
      aria-label="この特殊費用を削除"
      onClick={onDelete}
    >
      ✕
    </button>
  </li>
)
