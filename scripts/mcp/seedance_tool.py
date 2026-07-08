#!/usr/bin/env python3
"""
Seedance MCP Tool - AI Video/Animation Generation
==================================================
完全自包含的 MCP 服务器，不依赖外部平台。
提供视频生成、动画制作、帧序列处理等功能。

模式:
  1. local (默认) - 本地模式，使用内置算法生成简单动画，无需任何 API
  2. api - 远程 API 模式（如配置了 API Key，自动启用）
  3. mock - 模拟模式，返回演示数据

使用:
  python seedance_tool.py
  python seedance_tool.py --api-key YOUR_KEY
"""

import sys
import os
import json
import base64
import struct
import hashlib
import time
import io
import uuid
import random
from datetime import datetime
from typing import Any

# 将上级目录加入路径，以便导入 mcp_server
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import MCPServer

# ============================================================
# 配置
# ============================================================
CONFIG = {
    "api_key": "",
    "api_url": "",  # 可选：自定义 API 端点
    "mode": "local",  # local | api | mock
    "max_frames": 120,
    "default_fps": 24,
    "default_duration": 3,  # 秒
    "output_dir": "",  # 空则使用临时目录
}

# 尝试从环境变量加载配置
CONFIG["api_key"] = os.environ.get("SEEDANCE_API_KEY", "")
CONFIG["api_url"] = os.environ.get("SEEDANCE_API_URL", CONFIG["api_url"])
if CONFIG["api_key"]:
    CONFIG["mode"] = "api"
elif os.environ.get("SEEDANCE_MODE"):
    CONFIG["mode"] = os.environ["SEEDANCE_MODE"]

# 解析命令行参数
if "--api-key" in sys.argv:
    idx = sys.argv.index("--api-key")
    if idx + 1 < len(sys.argv):
        CONFIG["api_key"] = sys.argv[idx + 1]
        CONFIG["mode"] = "api"
if "--mode" in sys.argv:
    idx = sys.argv.index("--mode")
    if idx + 1 < len(sys.argv):
        CONFIG["mode"] = sys.argv[idx + 1]

# ============================================================
# 本地视频生成引擎 (无需外部依赖)
# ============================================================

def _lerp(a: float, b: float, t: float) -> float:
    """线性插值"""
    return a + (b - a) * t

def _generate_frame(seed: int, frame_index: int, total_frames: int,
                    style: str, params: dict) -> str:
    """
    生成一帧的 SVG 描述。
    返回 SVG 字符串，工具会将其编码展示。
    这是纯本地的帧生成，基于数学算法而非 AI 模型。
    """
    r = random.Random(seed + frame_index)
    w, h = params.get("width", 640), params.get("height", 480)
    t = frame_index / max(total_frames - 1, 1)  # 0.0 ~ 1.0
    bg = params.get("background_color", "#1a1a2e")

    if style == "particle":
        return _particle_frame(r, w, h, t, params)
    elif style == "wave":
        return _wave_frame(r, w, h, t, params)
    elif style == "geometric":
        return _geometric_frame(r, w, h, t, params)
    else:
        return _abstract_frame(r, w, h, t, seed, params)


def _particle_frame(r: random.Random, w: int, h: int, t: float,
                    params: dict) -> str:
    """粒子动画帧"""
    count = params.get("particle_count", 50)
    colors = params.get("colors", ["#00d2ff", "#3a7bd5", "#f093fb", "#4facfe"])
    elements = [f'<rect width="{w}" height="{h}" fill="{params.get("background_color", "#0a0a1a")}"/>']

    for i in range(count):
        # 粒子位置随时间变化
        phase = r.random() * 6.28
        speed = r.uniform(0.5, 2.0)
        radius = r.uniform(2, 6)
        base_x = r.uniform(0, w)
        base_y = r.uniform(0, h)

        x = base_x + (w * 0.2) * (t * speed + phase) % 1.0 - 0.1
        y = base_y + (h * 0.2) * ((t * speed + phase + 1.0) % 1.0) - 0.1
        color = colors[i % len(colors)]
        alpha = 0.3 + 0.7 * (0.5 + 0.5 * (t * 6.28 + phase))

        elements.append(
            f'<circle cx="{x}" cy="{y}" r="{radius}" '
            f'fill="{color}" opacity="{alpha:.2f}"/>'
        )
        # 粒子连线
        if i > 0 and r.random() < 0.3:
            px, py = float(elements[-1].split('cx="')[1].split('"')[0]), \
                     float(elements[-1].split('cy="')[1].split('"')[0])
            elements.append(
                f'<line x1="{x}" y1="{y}" x2="{px}" y2="{py}" '
                f'stroke="{color}" stroke-width="0.5" opacity="0.2"/>'
            )

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">\n'
    svg += "\n".join(elements)
    svg += "\n</svg>"
    return svg


def _wave_frame(r: random.Random, w: int, h: int, t: float,
                params: dict) -> str:
    """波形动画帧"""
    elements = [f'<rect width="{w}" height="{h}" fill="{params.get("background_color", "#0f0c29")}"/>']

    wave_count = params.get("wave_count", 5)
    colors = params.get("colors", ["#e91e63", "#9c27b0", "#3f51b5", "#00bcd4"])

    for wi in range(wave_count):
        points = []
        amplitude = params.get("amplitude", 60) * (0.5 + 0.5 * (wi / wave_count))
        frequency = 0.02 * (1 + wi * 0.3)
        phase = t * 3.0 + wi * 1.5
        y_offset = h * (wi + 0.5) / wave_count

        for x in range(0, w + 10, 10):
            y = y_offset + amplitude * (
                (x * frequency + phase) * 1.5 +
                0.3 * (x * frequency * 2 + phase * 1.3)
            )
            points.append(f"{x},{y:.1f}")

        color = colors[wi % len(colors)]
        alpha = 0.4 + 0.3 * (0.5 + 0.5 * (t * 2 + wi))

        elements.append(
            f'<polyline points="{" ".join(points)}" '
            f'fill="none" stroke="{color}" stroke-width="3" '
            f'opacity="{alpha:.2f}"/>'
        )
        # 底部填充
        bottom_points = points + [f"{w},{h}", f"0,{h}"]
        rgba = color.lstrip("#")
        r_dec, g_dec, b_dec = int(rgba[0:2], 16), int(rgba[2:4], 16), int(rgba[4:6], 16)
        elements.append(
            f'<polygon points="{" ".join(bottom_points)}" '
            f'fill="rgba({r_dec},{g_dec},{b_dec},0.1)"/>'
        )

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">\n'
    svg += "\n".join(elements)
    svg += "\n</svg>"
    return svg


def _geometric_frame(r: random.Random, w: int, h: int, t: float,
                     params: dict) -> str:
    """几何图案动画帧"""
    elements = [f'<rect width="{w}" height="{h}" fill="{params.get("background_color", "#000000")}"/>']

    shapes = params.get("shape_count", 20)
    colors = params.get("colors", ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"])

    cx, cy = w / 2, h / 2
    # 旋转的主环形
    for i in range(shapes):
        angle = (i / shapes) * 6.28 + t * 1.5
        radius = min(w, h) * 0.35 + (t * 30) % (min(w, h) * 0.2)
        sx = cx + radius * (angle)
        sy = cy + radius * (angle)

        size = 15 + 10 * (0.5 + 0.5 * (t * 3 + i))
        color = colors[i % len(colors)]
        alpha = 0.6 + 0.4 * (0.5 + 0.5 * (t * 2 + i * 0.5))

        elements.append(
            f'<rect x="{sx - size/2}" y="{sy - size/2}" '
            f'width="{size}" height="{size}" rx="{size/4}" '
            f'fill="none" stroke="{color}" stroke-width="2" '
            f'opacity="{alpha:.2f}" '
            f'transform="rotate({(t * 360 + i * 30) % 360} {sx} {sy})"/>'
        )

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">\n'
    svg += "\n".join(elements)
    svg += "\n</svg>"
    return svg


def _abstract_frame(r: random.Random, w: int, h: int, t: float,
                    seed: int, params: dict) -> str:
    """抽象艺术动画帧"""
    elements = [f'<rect width="{w}" height="{h}" fill="{params.get("background_color", "#050510")}"/>']

    layers = params.get("layers", 8)
    colors = params.get("colors", ["#ff006e", "#fb5607", "#ffbe0b", "#3a86ff", "#8338ec"])

    for li in range(layers):
        phase = t * 2.0 + li * 1.2 + seed * 0.01
        cx = w / 2 + (w * 0.3) * (phase * 0.7)
        cy = h / 2 + (h * 0.2) * (phase * 0.5 + 1.0)
        radius = 30 + li * 25 + 20 * (0.5 + 0.5 * (phase))
        color = colors[li % len(colors)]
        alpha = 0.15 + 0.1 * li / layers

        elements.append(
            f'<circle cx="{cx % w}" cy="{cy % h}" r="{radius}" '
            f'fill="none" stroke="{color}" stroke-width="1.5" '
            f'opacity="{alpha:.2f}"/>'
        )

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">\n'
    svg += "\n".join(elements)
    svg += "\n</svg>"
    return svg


def generate_video_local(params: dict) -> list[dict]:
    """
    本地视频生成（无需 API Key）
    返回帧列表，每帧是一个 SVG 描述。
    """
    style = params.get("style", "wave")
    duration = params.get("duration", CONFIG["default_duration"])
    fps = params.get("fps", CONFIG["default_fps"])
    width = params.get("width", 640)
    height = params.get("height", 480)
    prompt = params.get("prompt", "")
    seed = params.get("seed", int(time.time()))

    # 根据 prompt 智能选择风格（简单关键词匹配）
    prompt_lower = prompt.lower()
    if prompt_lower:
        if any(w in prompt_lower for w in ["particle", "fire", "spark", "宇宙", "星空"]):
            style = "particle"
        elif any(w in prompt_lower for w in ["wave", "水波", "波浪", "ripple"]):
            style = "wave"
        elif any(w in prompt_lower for w in ["geometric", "几何", "shape", "方块"]):
            style = "geometric"

    total_frames = min(int(duration * fps), CONFIG["max_frames"])
    frames = []

    for i in range(total_frames):
        svg = _generate_frame(seed, i, total_frames, style, {
            "width": width,
            "height": height,
            "colors": params.get("colors") or ["#00d2ff", "#3a7bd5", "#f093fb", "#4facfe"],
            "background_color": params.get("background_color") or "#1a1a2e",
            **params.get("style_params", {}),
        })

        frames.append({
            "index": i,
            "timestamp": i / fps,
            "svg": svg,
            "type": "svg",
        })

    return frames


def generate_video_mock(params: dict) -> list[dict]:
    """模拟生成，返回演示数据"""
    duration = params.get("duration", CONFIG["default_duration"])
    fps = params.get("fps", CONFIG["default_fps"])
    total_frames = min(int(duration * fps), CONFIG["max_frames"])

    return [
        {
            "index": i,
            "timestamp": i / fps,
            "svg": f"<svg xmlns='http://www.w3.org/2000/svg' "
                   f"width='{params.get('width', 640)}' "
                   f"height='{params.get('height', 480)}'>"
                   f"<rect width='100%' height='100%' fill='#1a1a2e'/>"
                   f"<text x='320' y='240' text-anchor='middle' "
                   f"fill='white' font-size='24'>"
                   f"Seedance Demo - Frame {i + 1}/{total_frames}"
                   f"</text></svg>",
            "type": "svg_demo",
        }
        for i in range(min(total_frames, 10))  # mock 只返回 10 帧
    ]


def generate_video_api(params: dict) -> list[dict]:
    """通过 API 生成视频（需要 API Key）"""
    import urllib.request
    import urllib.error

    api_key = params.get("api_key") or CONFIG["api_key"]
    if not api_key:
        return _api_fallback(params, "API Key 未配置，切换到本地模式")

    api_url = CONFIG["api_url"] or "https://api.seedance.ai/v1/videos/generate"

    payload = json.dumps({
        "prompt": params.get("prompt", ""),
        "style": params.get("style", "natural"),
        "duration": params.get("duration", CONFIG["default_duration"]),
        "fps": params.get("fps", CONFIG["default_fps"]),
        "width": params.get("width", 640),
        "height": params.get("height", 480),
        "seed": params.get("seed"),
    }).encode("utf-8")

    req = urllib.request.Request(
        api_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if "frames" in result:
                return result["frames"]
            elif "video_url" in result:
                return [{"type": "video_url", "url": result["video_url"]}]
            else:
                return _api_fallback(params, f"API 返回格式异常: {str(result)[:200]}")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")[:200]
        return _api_fallback(params, f"HTTP {e.code}: {error_body}")
    except urllib.error.URLError as e:
        return _api_fallback(params, f"网络错误: {e.reason}")
    except Exception as e:
        return _api_fallback(params, f"请求失败: {e}")


def _api_fallback(params: dict, reason: str) -> list[dict]:
    """
    API 调用失败时的优雅降级。
    返回错误信息 + 本地生成的帧作为 fallback。
    """
    print(f"[Seedance] API 不可用 ({reason})，使用本地模式降级", file=sys.stderr)
    frames = generate_video_local(params)
    frames.insert(0, {
        "type": "notice",
        "message": f"⚠️ API 不可用 ({reason})，已使用本地模式代替",
    })
    return frames


# ============================================================
# 工具处理函数
# ============================================================

def handle_generate_video(args: dict) -> dict:
    """处理视频生成请求"""
    mode = args.get("mode") or CONFIG["mode"]
    prompt = args.get("prompt", "")
    style = args.get("style", "auto")

    # 选择生成模式
    if mode == "api" and CONFIG["api_key"]:
        frames = generate_video_api(args)
    elif mode == "mock":
        frames = generate_video_mock(args)
    else:
        frames = generate_video_local(args)

    # 构建响应
    total = len(frames)
    preview_frames = frames[:5]  # 最多返回 5 帧预览

    # 把 SVG 内容编码为更易展示的格式
    content_parts = []

    content_parts.append({
        "type": "text",
        "text": json.dumps({
            "status": "success",
            "video_info": {
                "prompt": prompt,
                "style": style,
                "mode": mode,
                "total_frames": total,
                "duration": args.get("duration", CONFIG["default_duration"]),
                "fps": args.get("fps", CONFIG["default_fps"]),
                "resolution": f"{args.get('width', 640)}x{args.get('height', 480)}",
                "seed": args.get("seed", int(time.time())),
            },
            "preview_frame_count": len(preview_frames),
            "preview_frames": [
                {
                    "index": f["index"],
                    "timestamp": f["timestamp"],
                    "type": f.get("type", "svg"),
                    "data": f.get("svg") or f.get("message") or f.get("url"),
                }
                for f in preview_frames
            ],
            "note": "本地模式生成的 SVG 帧，可在浏览器中渲染为动画",
        }, indent=2, ensure_ascii=False),
    })

    return {"content": content_parts}


def handle_get_info(args: dict) -> dict:
    """返回服务器状态信息"""
    mode = CONFIG["mode"]
    has_api = bool(CONFIG["api_key"])

    return {
        "content": [{
            "type": "text",
            "text": json.dumps({
                "server": "Seedance MCP Tool",
                "version": "1.0.0",
                "mode": mode,
                "api_configured": has_api,
                "api_available": has_api,
                "capabilities": [
                    "generate_video - 生成视频/动画",
                    "get_info - 获取服务器状态",
                    "list_styles - 列出可用风格",
                ],
                "styles": [
                    {"name": "wave", "desc": "波形动画, 适合水波/声波效果"},
                    {"name": "particle", "desc": "粒子动画, 适合星空/火花效果"},
                    {"name": "geometric", "desc": "几何图案动画, 适合抽象设计"},
                    {"name": "abstract", "desc": "抽象艺术动画"},
                ],
                "local_fallback": True,
                "fallback_message": "API 不可用时自动降级到本地模式",
            }, indent=2, ensure_ascii=False),
        }]
    }


def handle_list_styles(args: dict) -> dict:
    """列出所有可用的动画风格"""
    styles = [
        {
            "name": "wave",
            "description": "波形动画 - 流动的波浪线条",
            "params": {
                "wave_count": {"type": "integer", "default": 5, "desc": "波浪数量"},
                "amplitude": {"type": "integer", "default": 60, "desc": "振幅"},
            }
        },
        {
            "name": "particle",
            "description": "粒子动画 - 飘动的粒子系统",
            "params": {
                "particle_count": {"type": "integer", "default": 50, "desc": "粒子数量"},
            }
        },
        {
            "name": "geometric",
            "description": "几何图案 - 旋转的几何形状",
            "params": {
                "shape_count": {"type": "integer", "default": 20, "desc": "形状数量"},
            }
        },
        {
            "name": "abstract",
            "description": "抽象艺术 - 有机的抽象图形",
            "params": {}
        },
    ]

    return {
        "content": [{
            "type": "text",
            "text": json.dumps({"styles": styles}, indent=2, ensure_ascii=False),
        }]
    }


# ============================================================
# 主入口
# ============================================================

def main():
    server = MCPServer(name="seedance", version="1.0.0")

    # 注册 generate_video 工具
    server.register_tool(
        name="generate_video",
        description="生成视频或动画。支持四种模式: "
                    "local(本地/默认,无需API)、api(远程API)、mock(模拟数据)。"
                    "API不可用时自动降级到本地模式。",
        input_schema={
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "描述想要生成的视频内容（支持中英文）",
                },
                "style": {
                    "type": "string",
                    "enum": ["auto", "wave", "particle", "geometric", "abstract"],
                    "description": "动画风格 (auto=根据 prompt 自动选择)",
                },
                "duration": {
                    "type": "number",
                    "description": f"视频时长(秒)，默认{CONFIG['default_duration']}",
                    "default": CONFIG["default_duration"],
                },
                "fps": {
                    "type": "integer",
                    "description": f"帧率，默认{CONFIG['default_fps']}",
                    "default": CONFIG["default_fps"],
                },
                "width": {
                    "type": "integer",
                    "description": "视频宽度，默认640",
                    "default": 640,
                },
                "height": {
                    "type": "integer",
                    "description": "视频高度，默认480",
                    "default": 480,
                },
                "mode": {
                    "type": "string",
                    "enum": ["local", "api", "mock"],
                    "description": "生成模式: local=本地(默认), api=远程API, mock=模拟",
                },
                "seed": {
                    "type": "integer",
                    "description": "随机种子，相同种子生成相同结果",
                },
                "colors": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "自定义颜色列表，如 ['#ff0000', '#00ff00']",
                },
                "background_color": {
                    "type": "string",
                    "description": "背景色，如 '#1a1a2e'",
                },
            },
            "required": ["prompt"],
        },
        handler=handle_generate_video,
    )

    # 注册 get_info 工具
    server.register_tool(
        name="get_info",
        description="获取 Seedance MCP 工具的状态信息，包括当前模式、可用风格等",
        input_schema={
            "type": "object",
            "properties": {},
        },
        handler=handle_get_info,
    )

    # 注册 list_styles 工具
    server.register_tool(
        name="list_styles",
        description="列出所有可用的动画风格及其参数说明",
        input_schema={
            "type": "object",
            "properties": {},
        },
        handler=handle_list_styles,
    )

    # 启动服务器
    server.run()


if __name__ == "__main__":
    main()
