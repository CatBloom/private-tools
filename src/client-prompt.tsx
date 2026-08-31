import '@vitejs/plugin-react/preamble'
import { createRoot } from 'react-dom/client'
import PromptBuilderApp from './tools/prompt-builder'

createRoot(document.getElementById('root')!).render(<PromptBuilderApp />)
