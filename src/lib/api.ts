export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

// 各ツールの api.ts（bill-manager/my-todo/prompt-builder/credit-csv）で重複していた
// レスポンス読み取り処理。`{ ok, data }` / `{ ok:false, error }` 規約は CLAUDE.md 参照。
export const readResult = async <T>(response: Response): Promise<T> => {
  let body: ApiResult<T>
  try {
    body = (await response.json()) as ApiResult<T>
  } catch {
    throw new Error(`サーバーとの通信に失敗しました。(status: ${response.status})`)
  }

  if (!body.ok) {
    throw new Error(body.error.message)
  }

  return body.data
}
