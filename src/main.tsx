import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { track } from './lib/analytics'

// Minimal error visibility, privacy-stance compatible: crashes surface as a
// truncated `app-error` event in Umami instead of vanishing into consoles we
// never see. Deduped per session and capped so a render-loop crash can't
// flood the stats.
const reportedErrors = new Set<string>()
function reportAppError(kind: string, raw: unknown) {
  const message = String(raw ?? 'unknown').slice(0, 120)
  const key = `${kind}:${message}`
  if (reportedErrors.has(key) || reportedErrors.size >= 5) return
  reportedErrors.add(key)
  track('app-error', { kind, message })
}
window.addEventListener('error', (e) => reportAppError('error', e.message))
window.addEventListener('unhandledrejection', (e) =>
  reportAppError('rejection', e.reason),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
