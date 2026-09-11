export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

// fetch の keepalive はボディ合計約64KiBを超えると即失敗するため、それより小さい閾値のときだけ付与する。
const KEEPALIVE_BODY_LIMIT_BYTES = 60 * 1024

// pagehide からの flush（useGatedSave／useAutoSave）はページ破棄後も送信を継続させるため keepalive を
// 付けたいが、上限を超えるボディでは付けない。呼び出し側は keepalive を使いたいときだけこれを呼ぶ。
export const keepaliveInit = (body: string): { keepalive: true } | Record<string, never> =>
  new TextEncoder().encode(body).byteLength <= KEEPALIVE_BODY_LIMIT_BYTES ? { keepalive: true } : {}

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
