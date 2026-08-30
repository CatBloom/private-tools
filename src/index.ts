// Vercel の Hono プリセットは「hono を import しているファイル」をエントリポイントとして検出するため、
// この副作用 import は必須（削除すると "No entrypoint found which imports hono" になる）。
import 'hono'
import app from './server/app.js'

export default app
