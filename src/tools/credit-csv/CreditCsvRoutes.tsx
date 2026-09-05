import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider, Spinner } from '../../components/feedback'
import { ToolLayout } from '../../components/layout/ToolLayout'
import { FilesPage } from './pages/FilesPage'
import { AppDataProvider } from './state/AppDataContext'

// recharts を使うページ（Charts 経由）だけ lazy 化し、初期チャンクから recharts を外す。
// FilesPage は recharts に依存しないため eager のままでよい。
const DetailPage = lazy(() => import('./pages/DetailPage').then((m) => ({ default: m.DetailPage })))
const MerchantPage = lazy(() => import('./pages/MerchantPage').then((m) => ({ default: m.MerchantPage })))
const YearlyPage = lazy(() => import('./pages/YearlyPage').then((m) => ({ default: m.YearlyPage })))

// Alert/Confirm Provider は ToolLayout の内側（.ccsv-app[data-theme] の配下）に置く。外側に置くと
// トースト/ダイアログが .ccsv-app と兄弟要素になり、テーマ切替の [data-theme] スコープ変数を継承できない。
export const CreditCsvRoutes = () => (
  <AppDataProvider>
    <ToolLayout toolId="credit-csv" appClassName="ccsv-app">
      <AlertProvider>
        <ConfirmProvider>
          <Suspense fallback={<Spinner label="読み込み中" />}>
            <Routes>
              <Route path="/" element={<DetailPage />} />
              <Route path="/merchant/:merchant" element={<MerchantPage />} />
              <Route path="/yearly" element={<YearlyPage />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ConfirmProvider>
      </AlertProvider>
    </ToolLayout>
  </AppDataProvider>
)
