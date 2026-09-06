import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlertProvider, ConfirmProvider } from '../../components/feedback'
import { ToolLayout } from '../../components/layout/ToolLayout'
import { SectionPage } from './pages/SectionPage'
import { TodoProvider } from './state/TodoContext'
import './my-todo.css'

// Provider は ToolLayout の内側（.my-todo-app[data-theme] 配下）に置く。外側に置くとトースト/
// ダイアログが .my-todo-app と兄弟要素になり [data-theme] スコープの CSS 変数を継承できない。
const MyTodoRoutes = () => (
  <ToolLayout toolId="my-todo" appClassName="my-todo-app" tabs>
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
