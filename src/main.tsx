import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* Neo's design tokens. index.css referenced --neo-* in a comment only and never loaded
   this file, so every var(--neo-...) fell back to nothing. The wait-screen styles merged
   from moin-version on 03 Sep are the first rules that actually use them. */
import './styles/neo-tokens.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { installErrorLogging } from './lib/errorLog'

/* Public link, opened unattended — a silent crash would otherwise be invisible to us and a
   blank page to them. Installed before render so it catches errors during first paint. */
installErrorLogging()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
