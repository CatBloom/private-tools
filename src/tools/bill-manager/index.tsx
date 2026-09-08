import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider } from '../../components/feedback'
import { ToolLayout } from '../../components/layout/ToolLayout'
import { currentMonthKey } from './lib/monthKey'
import { MonthPage } from './pages/MonthPage'
import { YearPage } from './pages/YearPage'
import { LedgerProvider } from './state/LedgerContext'
import './bill-manager.css'

// Provider は ToolLayout の内側（.bill-manager-app[data-theme] 配下）に置く。外側に置くとトースト/
// ダイアログが .bill-manager-app と兄弟要素になり [data-theme] スコープの CSS 変数を継承できない。
const BillManagerRoutes = () => (
  <ToolLayout toolId="bill-manager" appClassName="bill-manager-app" tabs>
    <AlertProvider>
      <ConfirmProvider>
        <LedgerProvider>
          <Routes>
            <Route path="/" element={<YearPage />} />
            <Route path="/year/:year" element={<YearPage />} />
            <Route path="/month" element={<Navigate to={`/month/${currentMonthKey()}`} replace />} />
            <Route path="/month/:month" element={<MonthPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </LedgerProvider>
      </ConfirmProvider>
    </AlertProvider>
  </ToolLayout>
)

const BillManagerApp = () => (
  <BrowserRouter basename="/tools/bill-manager">
    <BillManagerRoutes />
  </BrowserRouter>
)

export default BillManagerApp
