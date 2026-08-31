import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CategoryPage } from './pages/CategoryPage'
import { PROMPT_CATEGORY_IDS } from './shared/categories'
import './prompt-builder.css'

const PromptBuilderRoutes = () => (
  <Layout>
    <Routes>
      {PROMPT_CATEGORY_IDS.map((category) => (
        <Route key={category} path={`/${category}`} element={<CategoryPage key={category} category={category} />} />
      ))}
      <Route path="*" element={<Navigate to={`/${PROMPT_CATEGORY_IDS[0]}`} replace />} />
    </Routes>
  </Layout>
)

const PromptBuilderApp = () => (
  <BrowserRouter basename="/tools/prompt-builder">
    <PromptBuilderRoutes />
  </BrowserRouter>
)

export default PromptBuilderApp
