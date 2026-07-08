# Changelog

## [0.0.75] - 2026-07-08

### 🚀 New Features

- **MCP 设置支持自定义提供商** — 新增 "Custom (Manual Config)" 提供商选项，支持自由添加第三方 MCP 服务器
- **MCP 设置支持环境变量** — 添加 MCP 服务器时可配置环境变量（AGNES_API_KEY 等），敏感字段自动密码掩码
- **agnes-image MCP 支持环境变量 Key** — 支持通过 `AGNES_API_KEY` 环境变量传入 API Key，适配打包后的 MCP 配置流程
- **打包兼容** — `scripts/mcp` 和 MCP 脚本已加入 extraResources，打包后路径自动适应

### 🔧 Bug Fixes

- 修复 MCP 设置没有自定义选项导致无法添加第三方服务器的问题

## [0.0.74] - 2026-07-08

### 🚀 New Features

- **🧠 记忆系统（Knowledge Memory）** — 全新的持久化知识记忆功能：
  - 📝 **自动知识提取**：对话完成后自动分析并提取关键信息（文件操作、代码修改等），存入本地 SQLite 数据库
  - 🔍 **智能记忆检索**：新对话启动时自动检索相关记忆并注入 AI 上下文，让 AI "记住"历史知识
  - 🏷️ **分类与标签**：支持按类别（general/code/user_pref/project/tech）和标签筛选管理
  - ✏️ **手动管理**：支持手动添加、编辑、删除记忆（后续版本提供 UI）
  - 🔌 **记忆 API**：完整的 tRPC CRUD 接口，支持关键词搜索和相关性检索
- **🌐 学习工具（Learn Tool）** — 全新的 MCP 学习服务器：
  - 🔎 **Web 搜索**：通过 DuckDuckGo 免费搜索互联网，无需 API Key
  - 📄 **网页获取**：获取网页内容并自动提取可读正文
  - 🧠 **从 URL 学习**：获取网页 → 提取摘要 → 生成可存储的知识
  - 📝 **从文本学习**：从任意文本中提取结构化知识
- **✍️ 自动续写机制** — OpenAI/Custom 模型路径新增自动续写：
  - 检测 `finish_reason === "length"`（被 token 上限截断）时自动追加"请继续"并重新请求
  - 最多自动续写 3 次，大幅降低长回复被截断的概率
  - `max_tokens` 从 4096 提升至 16384

### 🔧 Bug Fixes

- **修复多处硬编码 21st.dev URL** — 将所有外部 URL 统一为 `config.ts` 的 `getApiUrl()` 管理，支持 `MAIN_VITE_API_URL` 环境变量覆盖
- **移除纯 UI 外部链接** — 清除 discord、changelog、claude.ai/settings/usage 等非核心外部链接
- **PostHog 默认 Key 已移除** — 分析功能完全 opt-in，不配置 KEY 即完全禁用
- **清理 agnes-image-mcp-config.json 明文 API Key**
- **NSIS 安装程序图标与便携版一致** — 统一使用 `assets/icon.ico`

### 📦 构建相关

- 移除外部平台 MCP 依赖，改用本地自包含 MCP 工具
- 新增 `.mcp.json` 本地 MCP 工具注册
- 新增 SQLite `memories` 表，支持 Drizzle ORM 自动迁移

## [0.0.73] - 2026-07-06

### 🚀 New Features

- **本地语音对话系统** — 完整的离线语音交互闭环：
  - 🎤 **ASR 语音识别**：基于 `faster-whisper` 本地转写，无需联网，保护隐私
  - 🔊 **TTS 语音合成**：基于 Kokoro 模型或 Windows SAPI，离线文字转语音
  - 🔄 **自动对话闭环**：录音 → 本地转写 → 自动发送给 Claude → AI 回复 → TTS 朗读回复
  - ⚙️ 支持配置 ASR 模型大小（tiny/base/small/medium/large）和 TTS 引擎
- **语音输入：浏览器语音识别降级方案** — 使用 Web Speech API 作为离线语音转文字方案，无需 OpenAI API Key。在 Electron（Chromium）中原生支持中文语音识别，无网络依赖。
- **自动更新改为 GitHub Releases** — auto-updater 从上游 CDN 迁移到本仓库 GitHub Releases，fork 后可独立发布版本更新。

### 🔧 Bug Fixes

- **修复语音输入不可用** — 添加 `--enable-features=WebSpeech` 和 `--enable-features=WebRtcUseNativeAudio` 标志；设置麦克风权限自动授予；主进程启动时强制清除代理环境变量；解决 Conexant 声卡驱动与 Chromium 内部音频栈的兼容性问题。
- **语音输入自动发送** — 语音转文字后，若输入框之前为空则自动发送消息。
- **修复「点击升级无反应」** — 上游 CDN 安装包名不匹配导致更新失败，已改为 GitHub Releases。
- **修复产品名重命名不完整** — `productName` 从 `1Code` 改为 `Rapid Code`，协议名称同步更新，图标路径修正为 `assets/icon.ico`。
- **修复 Windows 下 7za 构建兼容性** — 添加 `7za-wrapper.ps1` 过滤 `-snld` 参数，解决 electron-builder 在 Windows 上的打包问题。

### 📦 构建相关

- `electron-updater` 发布配置从 `generic`/CDN 改为 `github` provider
- 更新源指向 `HS435116/rapid-code` GitHub 仓库

### ♿ 无障碍改进

- **修复颜色对比度** — 调整 `--muted-foreground` CSS 变量（light: 46%→38%, dark: 58%→65%），添加 CSS 覆盖规则解决 `/60` 透明度和 `bg-foreground/[0.06]` 导致的对比度不足问题，确保达到 WCAG AA 4.5:1 标准。

---

## [0.0.72] - 2026-07-06

- 首次发布：Rapid Code - Multi-agent AI coding assistant
