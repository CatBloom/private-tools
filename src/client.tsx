import '@vitejs/plugin-react/preamble'
import { createRoot } from 'react-dom/client'
import CreditCsvApp from './tools/credit-csv'

createRoot(document.getElementById('root')!).render(<CreditCsvApp />)
