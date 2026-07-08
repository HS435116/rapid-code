#!/usr/bin/env python3
"""
Learn MCP Tool - Web Search & Knowledge Learning
=================================================
完全自包含的 MCP 服务器，用于搜索互联网并学习知识。
支持将学到的知识存入本地记忆系统。

功能:
  - web_search: 搜索互联网内容
  - web_fetch: 获取网页内容并提取正文
  - learn_from_url: 从 URL 学习 → 摘要 → 返回可存储的知识
  - learn_from_text: 从文本中提取知识

使用:
  python learn_tool.py
"""

import sys
import os
import json
import re
import html
import urllib.request
import urllib.parse
import urllib.error
import ssl
import time
from typing import Any
from html.parser import HTMLParser

# 将上级目录加入路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import MCPServer


# ============================================================
# HTML 正文提取器 (无需外部依赖)
# ============================================================

class HTMLTextExtractor(HTMLParser):
    """提取 HTML 中的纯文本内容"""

    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.skip_tags = {"script", "style", "nav", "header", "footer", "aside"}
        self.in_skip = False
        self.current_tag = ""

    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        if tag in self.skip_tags:
            self.in_skip = True
        if tag in ("p", "br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"):
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.skip_tags:
            self.in_skip = False
        if tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"):
            self.text_parts.append("\n")

    def handle_data(self, data):
        if not self.in_skip:
            text = data.strip()
            if text:
                self.text_parts.append(text)

    def get_text(self) -> str:
        text = " ".join(self.text_parts)
        # 清理多余空白
        text = re.sub(r'\n\s*\n', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        return text.strip()


def extract_text_from_html(html_content: str) -> str:
    """从 HTML 中提取可读的纯文本"""
    extractor = HTMLTextExtractor()
    try:
        extractor.feed(html_content)
    except Exception:
        pass
    return extractor.get_text()


def extract_title(html_content: str) -> str:
    """从 HTML 中提取标题"""
    match = re.search(r'<title[^>]*>(.*?)</title>', html_content, re.IGNORECASE | re.DOTALL)
    if match:
        return html.unescape(match.group(1)).strip()
    return ""


# ============================================================
# 网络搜索 (使用 DuckDuckGo 前端，无需 API Key)
# ============================================================

def web_search(query: str, max_results: int = 5) -> list[dict]:
    """
    通过 DuckDuckGo Lite 搜索互联网
    无需 API Key，完全免费，零外部依赖
    """
    results = []
    url = "https://lite.duckduckgo.com/lite/"

    data = urllib.parse.urlencode({"q": query}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            html_content = resp.read().decode("utf-8", errors="replace")

        # 从 DuckDuckGo Lite 结果中提取链接
        # 查找结果表格中的链接
        links = re.findall(
            r'<a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>',
            html_content,
            re.IGNORECASE,
        )

        seen = set()
        for link_url, link_text in links:
            # 过滤掉 DuckDuckGo 自身的链接和广告
            if any(skip in link_url for skip in ["duckduckgo.com", "duck.co", "twitter.com", "facebook.com"]):
                continue
            if link_url in seen:
                continue
            seen.add(link_url)

            text = html.unescape(re.sub(r'<[^>]+>', '', link_text)).strip()
            if text and len(text) > 5:
                results.append({
                    "title": text[:200],
                    "url": link_url,
                })

            if len(results) >= max_results:
                break

        # 如果没有从 HTML 解析到结果，返回搜索 URL
        if not results:
            search_url = f"https://duckduckgo.com/?q={urllib.parse.quote(query)}"
            results.append({
                "title": f"Search: {query}",
                "url": search_url,
                "note": "Could not extract specific results. Click the search URL to view results."
            })

    except Exception as e:
        results.append({
            "title": f"Search failed: {e}",
            "url": "",
            "error": str(e),
        })

    return results


# ============================================================
# 网页内容获取
# ============================================================

def web_fetch(url: str, max_chars: int = 5000) -> dict:
    """获取网页内容并提取可读文本"""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/120.0.0.0 Safari/537.36",
            },
            method="GET",
        )

        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            html_content = resp.read().decode("utf-8", errors="replace")
            content_type = resp.headers.get("Content-Type", "")

        title = extract_title(html_content)
        text = extract_text_from_html(html_content)

        # 截断到最大字符数
        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n[... content truncated ...]"

        return {
            "url": url,
            "title": title,
            "content": text,
            "content_type": content_type,
            "content_length": len(text),
            "status": "success",
        }

    except urllib.error.HTTPError as e:
        return {
            "url": url,
            "error": f"HTTP {e.code}: {e.reason}",
            "status": "error",
        }
    except urllib.error.URLError as e:
        return {
            "url": url,
            "error": f"Network error: {e.reason}",
            "status": "error",
        }
    except Exception as e:
        return {
            "url": url,
            "error": str(e),
            "status": "error",
        }


# ============================================================
# 知识提取与学习
# ============================================================

def summarize_text(text: str, max_sentences: int = 5) -> str:
    """
    简单摘要提取（无需 AI 模型）
    提取文本中的重要句子作为摘要
    """
    # 按句子分割
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # 找包含关键词的句子作为重要句子
    important_keywords = [
        "important", "significant", "key", "主要", "重要", "关键", "核心",
        "result", "find", "show", "demonstrate", "indicate", "suggest",
        "therefore", "thus", "consequently", "in conclusion",
        "创新", "突破", "首次", "最新", "提出", "实现", "发现",
    ]

    scored_sentences = []
    for s in sentences:
        s_lower = s.lower()
        score = sum(1 for kw in important_keywords if kw in s_lower)
        # 优先选较长的句子（包含更多信息）
        score += min(len(s) / 100, 3)
        scored_sentences.append((score, s))

    scored_sentences.sort(key=lambda x: x[0], reverse=True)
    summary = "\n".join(s[1] for s in scored_sentences[:max_sentences])

    return summary if summary else text[:500]


def learn_from_content(content: str, source_url: str = "") -> dict:
    """
    从内容中提取知识，返回可存储的记忆格式
    """
    # 提取摘要
    summary = summarize_text(content, max_sentences=3)

    # 提取关键词作为标签
    words = re.findall(r'\b[a-zA-Z]\w+\b', content)
    word_freq = {}
    for w in words:
        if len(w) > 4:
            word_freq[w.lower()] = word_freq.get(w.lower(), 0) + 1

    # 取出现频率最高的词作为标签（排除常见词）
    common_words = {
        "this", "that", "with", "from", "about", "which", "there", "their",
        "would", "could", "should", "have", "been", "were", "being",
        "does", "just", "also", "very", "well", "even", "than", "then",
        "they", "them", "some", "such", "only", "more", "most", "other",
        "into", "over", "after", "before", "your", "will", "tell",
    }
    tags = [w for w, c in sorted(word_freq.items(), key=lambda x: -x[1])[:8]
            if w not in common_words]

    return {
        "content": content[:3000],
        "summary": summary[:300],
        "tags": tags,
        "source_url": source_url,
        "category": "tech" if any(t in content.lower() for t in
                                    ["code", "api", "function", "library", "framework", "github",
                                     "python", "javascript", "typescript", "algorithm", "软件",
                                     "编程", "开发", "框架", "库", "接口"])
                    else "general",
    }


# ============================================================
# MCP 工具处理函数
# ============================================================

def handle_web_search(args: dict) -> dict:
    """处理网页搜索请求"""
    query = args.get("query", "")
    max_results = args.get("max_results", 5)

    if not query:
        return {"content": [{"type": "text", "text": "请提供搜索关键词 (query)"}]}

    results = web_search(query, max_results)

    return {
        "content": [{
            "type": "text",
            "text": json.dumps({
                "status": "success",
                "query": query,
                "results_count": len(results),
                "results": results,
            }, indent=2, ensure_ascii=False),
        }]
    }


def handle_web_fetch(args: dict) -> dict:
    """处理网页获取请求"""
    url = args.get("url", "")
    max_chars = args.get("max_chars", 5000)

    if not url:
        return {"content": [{"type": "text", "text": "请提供 URL"}]}

    result = web_fetch(url, max_chars)

    return {
        "content": [{
            "type": "text",
            "text": json.dumps(result, indent=2, ensure_ascii=False),
        }]
    }


def handle_learn_from_url(args: dict) -> dict:
    """从 URL 学习知识"""
    url = args.get("url", "")

    if not url:
        return {"content": [{"type": "text", "text": "请提供 URL"}]}

    # 1. 获取网页内容
    fetch_result = web_fetch(url, max_chars=8000)
    if fetch_result.get("status") == "error":
        return {"content": [{"type": "text", "text": json.dumps(fetch_result, indent=2, ensure_ascii=False)}]}

    # 2. 提取知识
    content = fetch_result.get("content", "")
    title = fetch_result.get("title", "")

    learned = learn_from_content(content, url)
    learned["title"] = title

    return {
        "content": [{
            "type": "text",
            "text": json.dumps({
                "status": "success",
                "learned": learned,
                "fetch_info": {
                    "url": url,
                    "title": title,
                    "content_length": len(content),
                },
                "usage": "Use the memories.create API to save this knowledge:\n"
                         f"content: {json.dumps(learned['content'][:200])}...\n"
                         f"summary: {json.dumps(learned['summary'])}\n"
                         f"category: {learned['category']}\n"
                         f"tags: {json.dumps(learned['tags'])}\n"
                         f"sourceUrl: {json.dumps(url)}",
            }, indent=2, ensure_ascii=False),
        }]
    }


def handle_learn_from_text(args: dict) -> dict:
    """从文本中提取知识"""
    text = args.get("text", "")

    if not text:
        return {"content": [{"type": "text", "text": "请提供要学习的文本"}]}

    learned = learn_from_content(text, args.get("source_url", ""))

    return {
        "content": [{
            "type": "text",
            "text": json.dumps({
                "status": "success",
                "learned": learned,
                "usage": "Use the memories.create API to save this knowledge:\n"
                         f"content: {json.dumps(learned['content'][:200])}...\n"
                         f"summary: {json.dumps(learned['summary'])}\n"
                         f"category: {learned['category']}\n"
                         f"tags: {json.dumps(learned['tags'])}",
            }, indent=2, ensure_ascii=False),
        }]
    }


# ============================================================
# 主入口
# ============================================================

def main():
    server = MCPServer(name="learn_tool", version="1.0.0")

    server.register_tool(
        name="web_search",
        description="Search the internet for information. "
                    "Returns search results with titles and URLs. "
                    "Free, no API key required.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (supports English and Chinese)",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
        handler=handle_web_search,
    )

    server.register_tool(
        name="web_fetch",
        description="Fetch and extract readable content from a webpage. "
                    "Returns the page title and main text content.",
        input_schema={
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL of the webpage to fetch",
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum characters to return (default: 5000)",
                    "default": 5000,
                },
            },
            "required": ["url"],
        },
        handler=handle_web_fetch,
    )

    server.register_tool(
        name="learn_from_url",
        description="Learn knowledge from a URL: fetch the page, "
                    "extract key information, and format it as storable knowledge. "
                    "The result can be saved as a memory.",
        input_schema={
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to learn from",
                },
            },
            "required": ["url"],
        },
        handler=handle_learn_from_url,
    )

    server.register_tool(
        name="learn_from_text",
        description="Extract knowledge from text content. "
                    "Analyzes the text and formats it as structured knowledge "
                    "that can be saved as a memory.",
        input_schema={
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text content to learn from",
                },
                "source_url": {
                    "type": "string",
                    "description": "Optional source URL for attribution",
                },
            },
            "required": ["text"],
        },
        handler=handle_learn_from_text,
    )

    server.run()


if __name__ == "__main__":
    main()
