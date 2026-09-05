import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider } from '../../components/feedback'
import { ToolLayout } from '../../components/layout/ToolLayout'
import { SectionPage } from './pages/SectionPage'
import { TodoProvider } from './state/TodoContext'
import './my-todo.css'

// Provider は ToolLayout の内側（.mytodo-app[data-theme] の配下）に置く。BrowserRouter の外側に
// 置くと、AlertProvider/ConfirmProvider が描画するトースト/ダイアログが .mytodo-app と
// 兄弟要素になり、ライト/ダーク切替の CSS 変数（[data-theme] スコープ）を継承できないため
// （prompt-builder の index.tsx と同じ理由）。TodoProvider は useAlert/useConfirm を使うため
// AlertProvider/ConfirmProvider の内側・Routes の外側に置き、Today/Someday のページ遷移を
// またいで状態（と保存直列化の状態）を保持する。
const MyTodoRoutes = () => (
  <ToolLayout toolId="my-todo" appClassName="mytodo-app">
    <AlertProvider>
      <ConfirmProvider>
        <TodoProvider>
          <Routes>
            <Route path="/today" element={<SectionPage section="today" />} />
            <Route path="/someday" element={<SectionPage section="someday" />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </TodoProvider>
      </ConfirmProvider>
    </AlertProvider>
  </ToolLayout>
)

const MyTodoApp = () => (
  <BrowserRouter basename="/tools/my-todo">
    <MyTodoRoutes />
  </BrowserRouter>
)

export default MyTodoApp
