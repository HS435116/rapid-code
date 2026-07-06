// Why Did You Render - MUST be first import (before React)
import "./wdyr"

// Only initialize Sentry in production to avoid IPC errors in dev mode
if (import.meta.env.PROD) {
  import("@sentry/electron/renderer").then((Sentry) => {
    Sentry.init()
  })
}

import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles/globals.css"
import { preloadDiffHighlighter } from "./lib/themes/diff-view-highlighter"

// Preload shiki highlighter for diff view (prevents delay when opening diff sidebar)
preloadDiffHighlighter()

// Suppress ResizeObserver loop error - this is a non-fatal browser warning
// that can occur when layout changes trigger observation callbacks
// Common with virtualization libraries and diff viewers
const resizeObserverErr = /ResizeObserver loop/

// Suppress Electron CSP warning in dev mode (safe-eval needed by AI SDK/Zod)
// The warning only appears in development and is suppressed in packaged builds.
const electronCspWarn = /Electron Security Warning.*Insecure Content-Security-Policy/

// Handle both error event and unhandledrejection
window.addEventListener("error", (e) => {
  if (e.message && resizeObserverErr.test(e.message)) {
    e.stopImmediatePropagation()
    e.preventDefault()
    return false
  }
})

// Also override window.onerror for broader coverage
const originalOnError = window.onerror
window.onerror = (message, source, lineno, colno, error) => {
  if (typeof message === "string" && resizeObserverErr.test(message)) {
    return true // Suppress the error
  }
  if (originalOnError) {
    return originalOnError(message, source, lineno, colno, error)
  }
  return false
}

// Suppress Electron CSP warning in console (dev mode only, harmless)
const originalWarn = console.warn
console.warn = (...args) => {
  if (
    args.length > 0 &&
    typeof args[0] === "string" &&
    electronCspWarn.test(args[0])
  ) {
    return // Suppress CSP warning
  }
  originalWarn.apply(console, args)
}

const rootElement = document.getElementById("root")

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />)
}
