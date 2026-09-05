import '@vitejs/plugin-react/preamble'
import { mountTool } from './lib/mountTool'
import CreditCsvApp from './tools/credit-csv'

mountTool(<CreditCsvApp />)
