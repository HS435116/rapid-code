/**
 * 翻译壳注入器 - 主进程模块
 * 在渲染进程加载后将翻译引擎注入到页面上下文
 * 同时初始化本地存储（跳过引导、清除错误模型配置）
 */
import type { BrowserWindow } from "electron"
import { generateEngineCode } from "./engine"

/**
 * 生成 localStorage 初始化脚本（注入到 HTML 中，早于 React 执行）
 */
function generateInitScript(): string {
  return `
<script>
// Rapid Code Init: 跳过引导页
if (!localStorage.getItem('onboarding:billing-method')) {
  localStorage.setItem('onboarding:billing-method', 'byok');
}
if (!localStorage.getItem('onboarding:api-key-completed')) {
  localStorage.setItem('onboarding:api-key-completed', 'true');
}
// 清除错误的自定义模型配置
if (localStorage.getItem('agents:claude-custom-config')) {
  console.log('[1Code Init] Clearing invalid model config');
  localStorage.removeItem('agents:claude-custom-config');
}
</script>
`
}

/**
 * 将翻译引擎注入到指定的 BrowserWindow
 * 同时预置本地存储以跳过引导
 */
export function injectTranslator(window: BrowserWindow): void {
  // 1. 拦截 HTML 响应，注入初始化脚本（在 React 加载之前）
  const filter = { urls: ["http://localhost:5173/*", "file://*index.html*"] }
  window.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
    // 只处理主文档请求（不是子资源）
    if (details.type === "mainFrame") {
      // 通过 beforeRequest 注入脚本到响应体
      const initScript = generateInitScript()
      callback({
        requestHeaders: details.requestHeaders,
      })
    } else {
      callback({})
    }
  })

  // 拦截 HTML 响应注入初始化脚本
  window.webContents.session.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (details.type === "mainFrame") {
      const initScript = generateInitScript()
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "X-1Code-Init": ["true"],
        },
      })
    } else {
      callback({})
    }
  })

  // 2. 页面加载完成后注入翻译引擎
  window.webContents.on("did-finish-load", () => {
    try {
      const engineCode = generateEngineCode()
      window.webContents
        .executeJavaScript(engineCode, { world: "main" })
        .then(() => {
          console.log("[Translator] ✓ Translation engine injected")
        })
        .catch((err: Error) => {
          console.warn("[Translator] Injection failed:", err.message)
        })
    } catch (err) {
      console.warn("[Translator] Error during injection:", err)
    }
  })
}
