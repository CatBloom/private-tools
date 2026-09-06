import '@vitejs/plugin-react/preamble'
import { mountTool } from './lib/mountTool'
import PromptBuilderApp from './tools/prompt-builder'

mountTool(<PromptBuilderApp />)
