import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider, Spinner } from '../../components/feedback'
import { ToolLayout } from '../../components/layout/ToolLayout'
import { RegisterPage } from './pages/RegisterPage'
import { WordsPage } from './pages/WordsPage'
import { WordsProvider } from './state/WordsProvider'
import './prompt-builder.css'

// @dnd-kit を使う OutputPage だけ lazy 化し、初期チャンクから @dnd-kit を外す。
// WordsPage/RegisterPage は @dnd-kit に依存しないため eager のままでよい。
const OutputPage = lazy(() => import('./pages/OutputPage').then((m) => ({ default: m.OutputPage })))

// Provider は ToolLayout の内側（.prompt-builder-app[data-theme] の配下）に置く。BrowserRouter の外側に
// 置くと、AlertProvider/ConfirmProvider が描画するトースト/ダイアログが .prompt-builder-app と
// 兄弟要素になり、ライト/ダーク切替の CSS 変数（[data-theme] スコープ）を継承できないため。
// WordsProvider は AlertProvider/ConfirmProvider の内側・Routes の外側に置き、ワード一覧・登録の
// 両ページ（タブ切替でアンマウントされない）から同じワード状態を共有する。
const PromptBuilderRoutes = () => (
  <ToolLayout toolId="prompt-builder" appClassName="prompt-builder-app" tabs>
    <AlertProvider>
      <ConfirmProvider>
        <WordsProvider>
          <Suspense fallback={<Spinner label="読み込み中" />}>
            <Routes>
              <Route path="/words" element={<WordsPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/output" element={<OutputPage />} />
              <Route path="*" element={<Navigate to="/words" replace />} />
            </Routes>
          </Suspense>
        </WordsProvider>
      </ConfirmProvider>
    </AlertProvider>
  </ToolLayout>
)

const PromptBuilderApp = () => (
  <BrowserRouter basename="/tools/prompt-builder">
    <PromptBuilderRoutes />
  </BrowserRouter>
)

export default PromptBuilderApp
