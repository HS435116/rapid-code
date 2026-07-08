/**
 * OpenAI/自定义 API 处理器
 * 支持工具调用（文件读写等）
 */
import type { UIMessageChunk } from "./claude/types"
import * as fs from "fs/promises"
import * as path from "path"
import { execSync } from "child_process"

interface OpenAIConfig {
  model: string
  token: string
  baseUrl: string
  requestTemplate?: string
}

interface MessageItem {
  role: "user" | "assistant" | "system"
  content: string | any[]
}

// ====== 内置工具定义 ======
const BUILTIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates or overwrites)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the directory" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to execute" },
        },
        required: ["command"],
      },
    },
  },
]

// ====== 工具执行器 ======
async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case "read_file": {
      const content = await fs.readFile(args.path, "utf-8")
      return content
    }
    case "write_file": {
      await fs.writeFile(args.path, args.content, "utf-8")
      return "File written successfully"
    }
    case "list_files": {
      const files = await fs.readdir(args.path)
      return files.join("\n")
    }
    case "execute_command": {
      // On Windows, execSync with utf-8 may produce garbled Chinese characters
      // because CMD uses GBK/codepage 936 by default. Use 'chcp 65001' to switch
      // to UTF-8 before executing the command.
      if (process.platform === "win32") {
        return execSync(`chcp 65001 >nul && ${args.command}`, {
          encoding: "utf-8",
          timeout: 30000,
        })
      }
      const result = execSync(args.command, { encoding: "utf-8", timeout: 30000 })
      return result
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

/**
 * 处理 vision 内容（图片）
 */
function buildVisionContent(text: string, images?: { mediaType: string; base64Data: string }[]) {
  if (!images || images.length === 0) return text
  const content: any[] = [{ type: "text", text }]
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64Data}` } })
  }
  return content
}

/**
 * OpenAI 流式聊天 — 支持工具调用
 */
export async function* streamOpenAI(
  config: OpenAIConfig,
  messages: MessageItem[],
  systemPrompt?: string,
  abortSignal?: AbortSignal,
  images?: { mediaType: string; base64Data: string }[],
  extraTools?: any[],
): AsyncGenerator<UIMessageChunk> {
  // Sanitize config values to prevent JSON serialization issues
  const safeModel = String(config.model || "").trim()
  const safeToken = String(config.token || "").trim()
  const safeBaseUrl = String(config.baseUrl || "").trim()

  if (!safeModel || !safeToken || !safeBaseUrl) {
    throw new Error("OpenAI config missing required fields: model, token, baseUrl")
  }

  // 合并工具：内置工具 + 外部工具
  const allTools = [...BUILTIN_TOOLS, ...(extraTools || [])]

  // 工具调用循环（最多5轮）
  let currentMessages: any[] = []
  if (systemPrompt) currentMessages.push({ role: "system", content: systemPrompt })
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : ""
    if (content) {
      const builtContent = msg.role === "user" ? buildVisionContent(content, images) : content
      currentMessages.push({ role: msg.role, content: builtContent })
    }
  }

	const textId = `msg-${Date.now()}`
  const maxRounds = 5
  let hasStreamedText = false

  // 自动续写计数器
  let autoContinueCount = 0
  const MAX_AUTO_CONTINUE = 3

  for (let round = 0; round < maxRounds; round++) {
    const body: any = {
      model: safeModel,
      messages: currentMessages,
      stream: true,
      max_tokens: 16384,
      temperature: 0.7,
    }
    if (allTools.length > 0) body.tools = allTools

    const apiUrl = safeBaseUrl

    // Validate JSON serialization before sending
    let jsonBody: string
    try {
      jsonBody = JSON.stringify(body)
      // Quick sanity check: ensure it parses back
      JSON.parse(jsonBody)
    } catch (jsonErr: any) {
      console.error(`[OpenAI] JSON serialization error for round ${round}:`, jsonErr.message, "Body keys:", Object.keys(body))
      throw new Error(`Request body serialization failed: ${jsonErr.message}`)
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${safeToken}` },
      body: jsonBody,
      signal: abortSignal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error")
      // Log request summary for debugging 400 errors
      console.error(`[OpenAI] API ${response.status} error on round ${round}: model=${safeModel}, messages=${currentMessages.length}, tools=${allTools.length > 0}`)
      throw new Error(`API error ${response.status}: ${errText.slice(0, 300)}`)
    }

    // 读取响应
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let fullContent = ""
    let toolCalls: any[] = []
    let isDone = false
    let finishReason: string | null = null

	    let textStarted = false
	    let stepStarted = false
	    let thinkingId: string | null = null
	    let thinkingText = ""
	    try {
	      while (true) {
	        const { done, value } = await reader.read()
	        if (done) break
	  
	        buffer += decoder.decode(value, { stream: true })
	        const lines = buffer.split("\n")
	        buffer = lines.pop() || ""
	  
	        for (const line of lines) {
	          if (!line.trim() || !line.startsWith("data: ")) continue
	          const data = line.slice(6).trim()
	          if (data === "[DONE]") { isDone = true; continue }
	  
	          try {
	            const chunk = JSON.parse(data)
	            const delta = chunk.choices?.[0]?.delta

	            // Handle reasoning/thinking content (common in DeepSeek, QwQ, etc.)
	            const reasoningDelta = delta?.reasoning_content || (delta as any)?.reasoning
	            if (reasoningDelta) {
	              if (!thinkingId) {
	                const tid = `thinking-${Date.now()}`
	                thinkingId = tid
	                thinkingText = ""
	                // Emit start/start-step before thinking (required by AI SDK)
	                if (!stepStarted) {
	                  yield { type: "start" }
	                  yield { type: "start-step" }
	                  stepStarted = true
	                }
	                yield {
	                  type: "tool-input-start",
	                  toolCallId: tid,
	                  toolName: "Thinking",
	                }
	              }
	              thinkingText += reasoningDelta
	              // Emit thinking as JSON fragment so AI SDK can parse it incrementally
	              yield {
	                type: "tool-input-delta",
	                toolCallId: thinkingId,
	                inputTextDelta: JSON.stringify(reasoningDelta).slice(1, -1),
	              }
	              continue // Don't process this delta as content
	            }
	            // If we were thinking and now we have content, close the thinking block
	            if (thinkingId && (delta?.content || delta?.tool_calls)) {
	              yield {
	                type: "tool-input-available",
	                toolCallId: thinkingId,
	                toolName: "Thinking",
	                input: { text: thinkingText },
	              }
	              yield {
	                type: "tool-output-available",
	                toolCallId: thinkingId,
	                output: { completed: true },
	              }
	              thinkingId = null
	              thinkingText = ""
	            }

	            if (delta?.content) {
	              // Emit start/start-step before first text (required by AI SDK)
	              if (!stepStarted) {
	                yield { type: "start" }
	                yield { type: "start-step" }
	                stepStarted = true
	              }
	              // Emit text-start before first text-delta (required by AI SDK)
	              if (!textStarted) {
	                yield { type: "text-start", id: textId }
	                textStarted = true
	              }
	              fullContent += delta.content
	              yield { type: "text-delta", id: textId, delta: delta.content }
	              hasStreamedText = true
	            }
	            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                let existing = toolCalls.find(t => t.index === tc.index)
                if (!existing) {
                  existing = { index: tc.index, id: tc.id, function: { name: "", arguments: "" } }
                  toolCalls.push(existing)
                }
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
                if (tc.id) existing.id = tc.id
              }
            }
            if (chunk.choices?.[0]?.finish_reason === "tool_calls") { isDone = true; finishReason = "tool_calls" }
            if (chunk.choices?.[0]?.finish_reason === "stop") { isDone = true; finishReason = "stop" }
            if (chunk.choices?.[0]?.finish_reason === "length") { isDone = true; finishReason = "length" }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock()
    }
	    // Emit text-end after streaming completes (required by AI SDK)
	    if (textStarted) {
	      yield { type: "text-end", id: textId }
	    }
	    // Close any remaining thinking block (stream ended without content after thinking)
	    if (thinkingId) {
	      yield {
	        type: "tool-input-available",
	        toolCallId: thinkingId,
	        toolName: "Thinking",
	        input: { text: thinkingText },
	      }
	      yield {
	        type: "tool-output-available",
	        toolCallId: thinkingId,
	        output: { completed: true },
	      }
	      thinkingId = null
	      thinkingText = ""
	    }

    // 如果是非流式响应，也检查 tool_calls
    if (!fullContent && !toolCalls.length) {
      try {
        const rawResponse = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${safeToken}` },
          body: JSON.stringify({ ...body, stream: false }),
          signal: abortSignal,
        })
        if (rawResponse.ok) {
          const result = await rawResponse.json()
          fullContent = result.choices?.[0]?.message?.content || ""
          toolCalls = result.choices?.[0]?.message?.tool_calls || []
        }
      } catch {}
    }

	    // 添加助手响应到消息列表
	    // IMPORTANT: 不使用 content: null — 某些 API 代理不支持 null content，会导致 400 错误
	    const assistantMsg: any = { role: "assistant" }
	    if (fullContent) {
	      assistantMsg.content = fullContent
	    }
	    if (toolCalls.length > 0) {
	      assistantMsg.tool_calls = toolCalls.map(tc => ({
        id: tc.id || `call_${Date.now()}_${tc.index}`,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }))
    }
	    currentMessages.push(assistantMsg)

	    // 自动续写检测：如果 finish_reason 为 "length"，说明到达 token 上限被截断
	    // 自动追加"请继续"并重试，最多 MAX_AUTO_CONTINUE 次
	    if (isDone && finishReason === "length" && fullContent && autoContinueCount < MAX_AUTO_CONTINUE) {
	      autoContinueCount++
	      console.log(`[OpenAI] 检测到截断 (round=${round}), 自动续写第 ${autoContinueCount}/${MAX_AUTO_CONTINUE} 次`)
	      currentMessages.push({
	        role: "user",
	        content: "请继续你的输出，不要重复已输出的内容，直接从断点继续。",
	      })
	      continue // 重新进入循环，发送续写请求
	    }

	    // 执行工具
	    if (toolCalls.length === 0) break

    for (const tc of toolCalls) {
      try {
        const args = JSON.parse(tc.function.arguments || "{}")
        const result = await executeTool(tc.function.name, args)
        currentMessages.push({
          role: "tool",
          tool_call_id: tc.id || `call_${Date.now()}_${tc.index}`,
          content: result,
        })
      } catch (err: any) {
        currentMessages.push({
          role: "tool",
          tool_call_id: tc.id || `call_${Date.now()}_${tc.index}`,
          content: `Error: ${err.message}`,
        })
      }
    }
  }

  // 输出最终结果
  // 只在流式输出没有产生文本时才发 text-start/delta/end (避免重复)
  // 如果有工具调用后的最终文本，也一并输出
  if (currentMessages.length > 1) {
    const lastMsg = currentMessages[currentMessages.length - 1]
    const finalContent = typeof lastMsg.content === "string" ? lastMsg.content : ""
    if (finalContent && !hasStreamedText) {
      yield { type: "start" }
      yield { type: "start-step" }
      yield { type: "text-start", id: textId }
      yield { type: "text-delta", id: textId, delta: finalContent }
      yield { type: "text-end", id: textId }
    }
    // Always emit finish for proper stream completion
    yield { type: "finish-step" }
    yield { type: "finish", messageMetadata: { inputTokens: 0, outputTokens: finalContent.length, totalTokens: finalContent.length } }
  } else {
    // No messages at all - still emit finish to prevent hanging
    yield { type: "finish-step" }
    yield { type: "finish", messageMetadata: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
  }
}
