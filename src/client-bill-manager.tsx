import '@vitejs/plugin-react/preamble'
import { mountTool } from './lib/mountTool'
import BillManagerApp from './tools/bill-manager'

mountTool(<BillManagerApp />)
