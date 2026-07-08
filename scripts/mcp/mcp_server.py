#!/usr/bin/env python3
"""
MCP (Model Context Protocol) Server 基础框架
完全自包含，无外部依赖。使用 Python 标准库实现 JSON-RPC 2.0 协议。

协议版本: 2025-03-26
传输方式: stdio (stdin/stdout)

参考: agnes-image-mcp.js
"""

import sys
import json
import traceback
from typing import Any, Callable


class MCPServer:
    """MCP 服务器基类 - 实现 JSON-RPC 2.0 协议"""

    def __init__(self, name: str, version: str = "1.0.0"):
        self.server_name = name
        self.server_version = version
        self.tools: dict[str, dict] = {}  # tool_name -> schema
        self.handlers: dict[str, Callable] = {}  # tool_name -> handler
        self.initialized = False

    def register_tool(self, name: str, description: str, input_schema: dict, handler: Callable):
        """注册一个 MCP 工具"""
        self.tools[name] = {
            "name": name,
            "description": description,
            "inputSchema": input_schema,
        }
        self.handlers[name] = handler

    def _send(self, obj: dict):
        """发送 JSON-RPC 消息到 stdout"""
        msg = json.dumps(obj, ensure_ascii=False)
        sys.stdout.write(msg + "\n")
        sys.stdout.flush()

    def _send_result(self, msg_id: Any, result: Any):
        self._send({"jsonrpc": "2.0", "id": msg_id, "result": result})

    def _send_error(self, msg_id: Any, code: int, message: str, data: Any = None):
        err = {"code": code, "message": message}
        if data is not None:
            err["data"] = data
        self._send({"jsonrpc": "2.0", "id": msg_id, "error": err})

    def _handle_initialize(self, msg_id: Any, params: dict):
        protocol_version = params.get("protocolVersion", "2025-03-26")
        self.initialized = True
        self._send_result(msg_id, {
            "protocolVersion": protocol_version,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": self.server_name, "version": self.server_version},
        })

    def _handle_list_tools(self, msg_id: Any):
        self._send_result(msg_id, {"tools": list(self.tools.values())})

    def _handle_call_tool(self, msg_id: Any, params: dict):
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        if tool_name not in self.handlers:
            self._send_error(msg_id, -32601, f"Tool not found: {tool_name}")
            return

        try:
            result = self.handlers[tool_name](arguments)
            if isinstance(result, dict) and "content" in result:
                self._send_result(msg_id, result)
            else:
                self._send_result(msg_id, {
                    "content": [{"type": "text", "text": str(result)}]
                })
        except Exception as e:
            self._send_error(msg_id, -32000, str(e), {
                "traceback": traceback.format_exc()
            })

    def process_message(self, line: str):
        """处理单行 JSON-RPC 消息"""
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            return

        method = msg.get("method")
        msg_id = msg.get("id")
        params = msg.get("params", {})

        try:
            if method == "initialize":
                self._handle_initialize(msg_id, params)
            elif method == "notifications/initialized":
                pass  # 无需响应
            elif method == "notifications/cancelled":
                pass
            elif method == "tools/list":
                self._handle_list_tools(msg_id)
            elif method == "tools/call":
                self._handle_call_tool(msg_id, params)
            elif msg_id is not None:
                self._send_error(msg_id, -32601, f"Method not found: {method}")
        except Exception as e:
            if msg_id is not None:
                self._send_error(msg_id, -32603, f"Internal error: {e}", {
                    "traceback": traceback.format_exc()
                })

    def run(self):
        """启动 MCP 服务器，监听 stdin"""
        # 发送 ready 信号
        self._send({"jsonrpc": "2.0", "method": "ready"})

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            self.process_message(line)


def safe_get(data: dict, *keys, default: Any = None) -> Any:
    """安全地从嵌套字典中取值"""
    for key in keys:
        if isinstance(data, dict):
            data = data.get(key)
        else:
            return default
    return data if data is not None else default
