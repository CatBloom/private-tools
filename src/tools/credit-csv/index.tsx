import { BrowserRouter } from 'react-router-dom'
import { AlertProvider } from '../../components/feedback'
import { CreditCsvRoutes } from './CreditCsvRoutes'
import './credit-csv.css'

const CreditCsvApp = () => (
  <AlertProvider>
    <BrowserRouter basename="/tools/credit-csv">
      <CreditCsvRoutes />
    </BrowserRouter>
  </AlertProvider>
)

export default CreditCsvApp
