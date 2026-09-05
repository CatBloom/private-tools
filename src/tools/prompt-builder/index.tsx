import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider, Spinner } from '../../components/feedback'
import { ToolLayout } from '../../components/layout/ToolLayout'
import { WordsPage } from './pages/WordsPage'
import './prompt-builder.css'

// @dnd-kit を使う OutputPage だけ lazy 化し、初期チャンクから @dnd-kit を外す。
// WordsPage は @dnd-kit に依存しないため eager のままでよい。
const OutputPage = lazy(() => import('./pages/OutputPage').then((m) => ({ default: m.OutputPage })))

// Provider は ToolLayout の内側（.pbuilder-app[data-theme] の配下）に置く。BrowserRouter の外側に
// 置くと、AlertProvider/ConfirmProvider が描画するトースト/ダイアログが .pbuilder-app と
// 兄弟要素になり、ライト/ダーク切替の CSS 変数（[data-theme] スコープ）を継承できないため。
const PromptBuilderRoutes = () => (
  <ToolLayout toolId="prompt-builder" appClassName="pbuilder-app">
    <AlertProvider>
      <ConfirmProvider>
        <Suspense fallback={<Spinner label="読み込み中" />}>
          <Routes>
            <Route path="/words" element={<WordsPage />} />
            <Route path="/output" element={<OutputPage />} />
            <Route path="*" element={<Navigate to="/words" replace />} />
          </Routes>
        </Suspense>
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
