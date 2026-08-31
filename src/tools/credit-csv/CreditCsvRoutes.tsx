import { Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider } from '../../components/feedback'
import { Layout } from './components/Layout'
import { DetailPage } from './pages/DetailPage'
import { FilesPage } from './pages/FilesPage'
import { MerchantPage } from './pages/MerchantPage'
import { YearlyPage } from './pages/YearlyPage'
import { AppDataProvider } from './state/AppDataContext'

// Alert/Confirm Provider は Layout の内側（.ccsv-app[data-theme] の配下）に置く。外側に置くと
// トースト/ダイアログが .ccsv-app と兄弟要素になり、テーマ切替の [data-theme] スコープ変数を継承できない。
export const CreditCsvRoutes = () => (
  <AppDataProvider>
    <Layout>
      <AlertProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/" element={<DetailPage />} />
            <Route path="/merchant/:merchant" element={<MerchantPage />} />
            <Route path="/yearly" element={<YearlyPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ConfirmProvider>
      </AlertProvider>
    </Layout>
  </AppDataProvider>
)
