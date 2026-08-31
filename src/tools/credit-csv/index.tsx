import { BrowserRouter } from 'react-router-dom'
import { CreditCsvRoutes } from './CreditCsvRoutes'
import './credit-csv.css'

const CreditCsvApp = () => (
  <BrowserRouter basename="/tools/credit-csv">
    <CreditCsvRoutes />
  </BrowserRouter>
)

export default CreditCsvApp
