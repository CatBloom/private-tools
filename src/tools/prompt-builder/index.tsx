import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider } from '../../components/feedback'
import { Layout } from './components/Layout'
import { WordsPage } from './pages/WordsPage'
import { OutputPage } from './pages/OutputPage'
import './prompt-builder.css'

// Provider は Layout の内側（.pbuilder-app[data-theme] の配下）に置く。BrowserRouter の外側に
// 置くと、AlertProvider/ConfirmProvider が描画するトースト/ダイアログが .pbuilder-app と
// 兄弟要素になり、ライト/ダーク切替の CSS 変数（[data-theme] スコープ）を継承できないため。
const PromptBuilderRoutes = () => (
  <Layout>
    <AlertProvider>
      <ConfirmProvider>
        <Routes>
          <Route path="/words" element={<WordsPage />} />
          <Route path="/output" element={<OutputPage />} />
          <Route path="*" element={<Navigate to="/words" replace />} />
        </Routes>
      </ConfirmProvider>
    </AlertProvider>
  </Layout>
)

const PromptBuilderApp = () => (
  <BrowserRouter basename="/tools/prompt-builder">
    <PromptBuilderRoutes />
  </BrowserRouter>
)

export default PromptBuilderApp
