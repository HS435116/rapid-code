# MCP 本地工具集

完全自包含的 MCP (Model Context Protocol) 工具，无需依赖外部平台。

## 文件结构

```
scripts/mcp/
├── mcp_server.py      # MCP 服务器基础框架 (JSON-RPC 2.0)
├── mcp_client.py      # MCP 客户端 (测试/管理工具)
├── seedance_tool.py   # Seedance 视频/动画生成工具
└── README.md
```

## 使用方式

### 1. 通过 AI 助手自动调用

在 `.mcp.json` 中已配置好，AI 助手可自动发现并使用这些工具。

### 2. 命令行手动测试

```bash
# 列出所有 MCP 服务器
python scripts/mcp/mcp_client.py list

# 发现项目中的 MCP 工具
python scripts/mcp/mcp_client.py discover

# 调用 generate_video 工具
python scripts/mcp/mcp_client.py call generate_video '{"prompt":"wave test"}'

# 查看服务器状态
python scripts/mcp/mcp_client.py check seedance

# 交互式模式
python scripts/mcp/mcp_client.py interactive
```

### 3. 直接使用 seedance 服务器

```bash
# 直接启动服务器（等待 stdin 输入）
python scripts/mcp/seedance_tool.py

# 指定 API Key 启用远程模式
python scripts/mcp/seedance_tool.py --api-key YOUR_KEY

# 指定模式
python scripts/mcp/seedance_tool.py --mode mock
```

## 可用工具

| 工具 | 服务器 | 说明 |
|------|--------|------|
| `generate_video` | seedance | 生成视频/动画 |
| `get_info` | seedance | 获取服务器状态 |
| `list_styles` | seedance | 列出动画风格 |

## 故障处理

所有工具内置了优雅降级机制：
- API 不可用时自动使用本地模式
- 所有功能在无网络环境下仍可工作
- 错误信息清晰明确

## 环境变量

| 变量 | 说明 |
|------|------|
| `SEEDANCE_API_KEY` | Seedance API Key (可选) |
| `SEEDANCE_API_URL` | 自定义 API 端点 (可选) |
| `SEEDANCE_MODE` | 运行模式: local/api/mock |
