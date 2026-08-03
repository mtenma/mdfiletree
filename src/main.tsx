import { createRoot } from 'react-dom/client'

import App from './App'

import './styles/tokens.css'
import './styles/app.css'
import './styles/markdown.css'
import './styles/shiki.css'
import 'katex/dist/katex.min.css'
import './styles/print.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('#root が見つかりません')
}

// DOM を直接組み替える処理（Shiki / Mermaid）が多いため、
// 副作用が二重に走る StrictMode は使わない
createRoot(container).render(<App />)
