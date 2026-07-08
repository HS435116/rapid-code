# Changelog

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
