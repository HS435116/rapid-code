# Changelog

## [0.0.73] - 2026-07-06

### 🚀 New Features

- **语音输入：浏览器语音识别降级方案** — 使用 Web Speech API 作为离线语音转文字方案，无需 OpenAI API Key。在 Electron（Chromium）中原生支持中文语音识别，无网络依赖。
- **自动更新改为 GitHub Releases** — auto-updater 从上游 CDN 迁移到本仓库 GitHub Releases，fork 后可独立发布版本更新。

### 🔧 Bug Fixes

- **修复「点击升级无反应」** — 因上游 CDN 安装包名（`1Code Setup`）与本项目（`Rapid Code Setup`）不匹配导致更新下载失败，现已指向本仓库 GitHub Releases。
- **修复产品名重命名不完整** — `productName` 从 `1Code` 改为 `Rapid Code`，协议名称同步更新，图标路径修正为 `assets/icon.ico`。
- **修复 Windows 下 7za 构建兼容性** — 添加 `7za-wrapper.ps1` 过滤 `-snld` 参数，解决 electron-builder 在 Windows 上的打包问题。

### 📦 构建相关

- `electron-updater` 发布配置从 `generic`/CDN 改为 `github` provider
- 更新源指向 `HS435116/rapid-code` GitHub 仓库

---

## [0.0.72] - 2026-07-06

- 首次发布：Rapid Code - Multi-agent AI coding assistant
