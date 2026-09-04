import '@vitejs/plugin-react/preamble'
import { createRoot } from 'react-dom/client'
import MyTodoApp from './tools/my-todo'

createRoot(document.getElementById('root')!).render(<MyTodoApp />)
