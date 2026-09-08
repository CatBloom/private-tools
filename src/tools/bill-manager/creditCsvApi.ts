import { TOOLS } from '../registry'

const CREDIT_CSV_API_BASE = `${TOOLS.find((tool) => tool.id === 'credit-csv')!.path}/api`

// 利用月（YYYYMM）の credit-csv ファイルを同一オリジンで取得する。未取込（404）は null、それ以外の
// エラーは throw する。KV には保存せず、表示のたびに毎回取得・集計する。
export const fetchCreditCsvBytes = async (usageMonth: string): Promise<ArrayBuffer | null> => {
  const response = await fetch(`${CREDIT_CSV_API_BASE}/files/${usageMonth}.csv`)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`クレカ明細の取得に失敗しました。(status: ${response.status})`)
  }
  return response.arrayBuffer()
}
