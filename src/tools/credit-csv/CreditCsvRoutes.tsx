import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DetailPage } from './pages/DetailPage'
import { FilesPage } from './pages/FilesPage'
import { MerchantPage } from './pages/MerchantPage'
import { YearlyPage } from './pages/YearlyPage'
import { AppDataProvider } from './state/AppDataContext'

export const CreditCsvRoutes = () => (
  <AppDataProvider>
    <Layout>
      <Routes>
        <Route path="/" element={<DetailPage />} />
        <Route path="/merchant/:merchant" element={<MerchantPage />} />
        <Route path="/yearly" element={<YearlyPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  </AppDataProvider>
)
