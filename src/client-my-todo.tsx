import '@vitejs/plugin-react/preamble'
import { mountTool } from './lib/mountTool'
import MyTodoApp from './tools/my-todo'

mountTool(<MyTodoApp />)
