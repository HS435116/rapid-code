#!/usr/bin/env python3
"""
MCP Client - 本地 MCP 工具客户端
=================================
用于测试和管理本地 MCP 服务器，无需依赖外部平台。

功能:
  - 发现项目中的 MCP 服务器
  - 列出所有可用的 MCP 工具
  - 调用 MCP 工具
  - 健康检查

使用:
  python mcp_client.py list                    # 列出所有工具
  python mcp_client.py call <tool> <json>      # 调用工具
  python mcp_client.py discover                # 发现项目中的 MCP 服务器
  python mcp_client.py check <name>            # 检查 MCP 服务器健康状态
"""

import sys
import os
import json
import subprocess
import glob
from pathlib import Path
from typing import Optional

# 将上级目录加入路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import MCPServer


# ============================================================
# MCP 服务器发现
# ============================================================

def discover_mcp_servers(project_root: str = None) -> list[dict]:
    """
    在项目中查找并发现 MCP 服务器。
    搜索路径:
      1. scripts/mcp/*.py 中的 MCP 工具
      2. .mcp.json 配置的 MCP 服务器
      3. ~/.claude.json 中注册的 MCP 服务器
    """
    if project_root is None:
        project_root = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        ))

    servers = []

    # 1. 扫描 scripts/mcp/ 目录
    mcp_dir = os.path.join(project_root, "scripts", "mcp")
    if os.path.isdir(mcp_dir):
        for py_file in sorted(glob.glob(os.path.join(mcp_dir, "*.py"))):
            name = os.path.splitext(os.path.basename(py_file))[0]
            if name in ("mcp_server", "mcp_client"):
                continue  # 跳过框架文件
            servers.append({
                "name": name,
                "type": "script",
                "path": py_file,
                "command": sys.executable,
                "args": [py_file],
                "description": f"本地 MCP 工具: {name}",
            })

    # 2. 读取 .mcp.json
    mcp_json = os.path.join(project_root, ".mcp.json")
    if os.path.isfile(mcp_json):
        try:
            with open(mcp_json, "r", encoding="utf-8") as f:
                config = json.load(f)
            mcp_servers = config.get("mcpServers", {})
            for name, cfg in mcp_servers.items():
                servers.append({
                    "name": name,
                    "type": "config",
                    "path": mcp_json,
                    "command": cfg.get("command", ""),
                    "args": cfg.get("args", []),
                    "description": cfg.get("description", f"MCP: {name}"),
                })
        except (json.JSONDecodeError, IOError) as e:
            print(f"[MCP Client] 读取 .mcp.json 失败: {e}", file=sys.stderr)

    # 3. 读取 ~/.claude.json
    claude_config = os.path.expanduser("~/.claude.json")
    if os.path.isfile(claude_config):
        try:
            with open(claude_config, "r", encoding="utf-8") as f:
                config = json.load(f)

            # 全局 MCP 服务器
            for name, cfg in config.get("mcpServers", {}).items():
                if not any(s["name"] == name for s in servers):
                    servers.append({
                        "name": name,
                        "type": "claude-global",
                        "path": claude_config,
                        "command": cfg.get("command", ""),
                        "args": cfg.get("args", []),
                        "description": f"Claude 全局 MCP: {name}",
                    })

            # 项目级别的 MCP 服务器
            for proj_path, proj_cfg in config.get("projects", {}).items():
                for name, cfg in proj_cfg.get("mcpServers", {}).items():
                    if not any(s["name"] == name for s in servers):
                        servers.append({
                            "name": name,
                            "type": f"claude-project ({proj_path})",
                            "path": claude_config,
                            "command": cfg.get("command", ""),
                            "args": cfg.get("args", []),
                            "description": f"Claude 项目 MCP: {name}",
                        })
        except (json.JSONDecodeError, IOError):
            pass

    return servers


# ============================================================
# MCP 服务器通信
# ============================================================

class McpClientError(Exception):
    pass


def call_mcp_server(command: str, args: list[str],
                    request: dict, timeout: int = 30) -> dict:
    """
    向 stdio MCP 服务器发送请求并接收响应。

    协议流程:
      1. 服务端启动后发送 {"jsonrpc":"2.0","method":"ready"}
      2. 客户端发送 initialize
      3. 客户端发送 notifications/initialized
      4. 客户端发送 tools/list 或 tools/call
    """
    try:
        proc = subprocess.Popen(
            [command] + args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError:
        raise McpClientError(f"找不到命令: {command}")
    except Exception as e:
        raise McpClientError(f"启动进程失败: {e}")

    try:
        # 等待 ready 信号
        ready_line = proc.stdout.readline()
        if not ready_line:
            stderr_output = proc.stderr.read()
            raise McpClientError(f"服务器未发送 ready 信号: {stderr_output[:200]}")

        # 发送 initialize
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "mcp-client", "version": "1.0.0"},
            },
        }
        proc.stdin.write(json.dumps(init_req) + "\n")
        proc.stdin.flush()

        init_resp = proc.stdout.readline()
        if not init_resp:
            raise McpClientError("初始化无响应")

        # 发送 notifications/initialized
        proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        )
        proc.stdin.flush()

        # 发送实际请求
        proc.stdin.write(json.dumps(request) + "\n")
        proc.stdin.flush()

        # 读取响应
        response = proc.stdout.readline()
        if not response:
            raise McpClientError("请求无响应")

        result = json.loads(response)
        return result

    finally:
        try:
            proc.stdin.close()
            proc.wait(timeout=5)
        except:
            proc.kill()


# ============================================================
# 命令行接口
# ============================================================

def cmd_list(args: list[str]):
    """列出所有可用的 MCP 工具"""
    servers = discover_mcp_servers()

    if not servers:
        print("未发现任何 MCP 服务器")
        return

    print(f"\n{'='*60}")
    print(f"  发现 {len(servers)} 个 MCP 服务器")
    print(f"{'='*60}\n")

    for s in servers:
        print(f"  📦 {s['name']}")
        print(f"     类型: {s['type']}")
        print(f"     路径: {s['path']}")
        print(f"     命令: {s['command']} {' '.join(s['args'])}")
        if s.get("description"):
            print(f"     描述: {s['description']}")
        print()


def cmd_discover(args: list[str]):
    """发现项目中的 MCP 服务器（JSON 格式）"""
    servers = discover_mcp_servers()
    print(json.dumps({"servers": servers}, indent=2, ensure_ascii=False))


def cmd_call(args: list[str]):
    """调用 MCP 工具

    用法: call <tool_name> '{"key": "value"}'
    """
    if len(args) < 2:
        print("用法: mcp_client.py call <tool_name> <json_params>", file=sys.stderr)
        sys.exit(1)

    tool_name = args[0]
    try:
        params = json.loads(args[1])
    except json.JSONDecodeError:
        params = {"prompt": args[1]}

    # 发现并找到工具
    servers = discover_mcp_servers()
    target = None

    # 先尝试精确匹配服务器名
    for s in servers:
        if s["name"] == tool_name:
            target = s
            break

    # 如果没找到，尝试找到提供该工具的服务器
    if not target:
        for s in servers:
            try:
                req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
                result = call_mcp_server(s["command"], s["args"], req)
                available = result.get("result", {}).get("tools", [])
                if any(t.get("name") == tool_name for t in available):
                    target = s
                    break
            except McpClientError:
                continue

    if not target:
        # 尝试直接作为脚本运行
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            f"{tool_name}.py"
        )
        if os.path.isfile(script_path):
            target = {
                "name": tool_name,
                "command": sys.executable,
                "args": [script_path],
            }
        else:
            print(f"找不到工具: {tool_name}", file=sys.stderr)
            print(f"可用服务器: {', '.join(s['name'] for s in servers)}", file=sys.stderr)
            sys.exit(1)

    request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": params,
        },
    }

    print(f"🔄 调用 {tool_name}...")
    try:
        result = call_mcp_server(target["command"], target["args"], request)
        if "error" in result:
            print(f"❌ 错误 [{result['error'].get('code', '?')}]: "
                  f"{result['error'].get('message', '未知错误')}")
        else:
            content = result.get("result", {}).get("content", [])
            for c in content:
                if c.get("type") == "text":
                    text = c["text"]
                    # 尝试格式化 JSON
                    try:
                        parsed = json.loads(text)
                        print(json.dumps(parsed, indent=2, ensure_ascii=False))
                    except (json.JSONDecodeError, TypeError):
                        print(text)
                else:
                    print(f"[{c.get('type', 'unknown')}]: {c.get('text', '')}")
    except McpClientError as e:
        print(f"❌ 调用失败: {e}")
        sys.exit(1)


def cmd_check(args: list[str]):
    """检查 MCP 服务器的健康状态"""
    name = args[0] if args else "all"
    servers = discover_mcp_servers()

    if name != "all":
        servers = [s for s in servers if s["name"] == name]

    if not servers:
        print(f"未找到 MCP 服务器{f' (名称: {name})' if name != 'all' else ''}")
        return

    for s in servers:
        print(f"🔍 检查 {s['name']}... ", end="")
        try:
            request = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
            }
            result = call_mcp_server(s["command"], s["args"], request)
            if "result" in result:
                tools = result["result"].get("tools", [])
                print(f"✅ 正常 ({len(tools)} 个工具)")
                for t in tools:
                    print(f"      - {t.get('name')}: {t.get('description', '')[:60]}")
            else:
                print(f"⚠️  异常: {result}")
        except McpClientError as e:
            print(f"❌ 失败: {e}")


def cmd_interactive(args: list[str]):
    """交互式测试模式"""
    servers = discover_mcp_servers()

    print("\n🎯 MCP 交互测试终端")
    print("=" * 50)
    print("可用命令:")
    print("  list          - 列出工具列表")
    print("  call <tool>   - 调用工具")
    print("  info          - 查看服务器状态")
    print("  exit/quit     - 退出")
    print()

    while True:
        try:
            cmd = input("mcp> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if cmd in ("exit", "quit", "q"):
            break
        elif cmd == "list":
            for s in servers:
                print(f"  {s['name']}  ({s['type']})")
                # 尝试连接并获取工具列表
                try:
                    request = {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/list",
                    }
                    result = call_mcp_server(s["command"], s["args"], request)
                    tools = result.get("result", {}).get("tools", [])
                    for t in tools:
                        print(f"    └─ {t.get('name')}: {t.get('description', '')[:60]}")
                except McpClientError as e:
                    print(f"    └─ ❌ {e}")
        elif cmd.startswith("call "):
            parts = cmd.split(" ", 2)
            tool_name = parts[1] if len(parts) > 1 else ""
            params_str = parts[2] if len(parts) > 2 else "{}"
            try:
                params = json.loads(params_str)
            except json.JSONDecodeError:
                params = {"prompt": params_str}
            cmd_call([tool_name, json.dumps(params)])
        elif cmd == "info":
            print(f"Python: {sys.version}")
            print(f"脚本目录: {os.path.dirname(os.path.abspath(__file__))}")
        elif cmd:
            print(f"未知命令: {cmd}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1]
    args = sys.argv[2:]

    commands = {
        "list": cmd_list,
        "discover": cmd_discover,
        "call": cmd_call,
        "check": cmd_check,
        "interactive": cmd_interactive,
    }

    if command in commands:
        commands[command](args)
    else:
        print(f"未知命令: {command}")
        print("可用命令: list, discover, call, check, interactive")


if __name__ == "__main__":
    main()
