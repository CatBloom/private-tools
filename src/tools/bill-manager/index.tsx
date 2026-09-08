import { BrowserRouter } from 'react-router-dom'
import { ToolLayout } from '../../components/layout/ToolLayout'
import './bill-manager.css'

// 雛形。PR 2 のクライアント実装で置き換える。
const BillManagerApp = () => (
  <BrowserRouter basename="/tools/bill-manager">
    <ToolLayout toolId="bill-manager" appClassName="bill-manager-app">
      <p>準備中</p>
    </ToolLayout>
  </BrowserRouter>
)

export default BillManagerApp
