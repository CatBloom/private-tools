import '@vitejs/plugin-react/preamble'
import { hydrateRoot } from 'react-dom/client'
import { App } from './ui/App'

hydrateRoot(document.getElementById('root')!, <App />)
