/**
 * OpenAI 兼容 API 聊天路由
 * 支持用户自定义请求 JSON 模板
 */
import { observable } from "@trpc/server/observable"
import { z } from "zod"
import { publicProcedure, router } from "../../trpc"
import { streamOpenAI } from "../../openai-handler"
import type { UIMessageChunk } from "../../claude/types"

const imageAttachmentSchema = z.object({
  mediaType: z.string(),
  base64Data: z.string(),
})

// 将 MCP 工具转换为 OpenAI 函数调用格式（带超时保护）
async function getOpenAITools(): Promise<any[]> {
  // MCP 工具获取暂时禁用，使用 Claude 模型时原生支持工具调用
  return []
}

/**
 * 编程助手系统提示词 - 告诉模型它可以读写文件、执行命令
 */
const CODING_ASSISTANT_SYSTEM_PROMPT = `You are a coding assistant running on the user's local machine.
You have FULL access to the local file system and can:

1. Read files using the \`read_file\` tool (provide absolute path)
2. Write/create files using the \`write_file\` tool (provide absolute path and content)
3. List directory contents using the \`list_files\` tool
4. Execute shell commands using the \`execute_command\` tool

IMPORTANT RULES:
- When asked to read or work with files, use the available tools - DO NOT say you cannot access files
- You CAN access any file on the user's system using absolute paths
- Always use absolute paths when reading/writing files
- When executing commands, be careful about destructive operations
- You are running locally, NOT in the cloud - you have full file system access
- If a file path is provided as relative, the working directory is:`

export const openaiChatRouter = router({
  chat: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        model: z.string(),
        token: z.string(),
        baseUrl: z.string(),
        cwd: z.string().optional(),
        requestTemplate: z.string().optional(),
        images: z.array(imageAttachmentSchema).optional(),
        tools: z.array(z.any()).optional(),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant", "system"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        let isActive = true

        // Safe emit: no-op if observable already closed (prevents ERR_INVALID_STATE)
        const safeEmit = (chunk: UIMessageChunk) => {
          if (!isActive) return
          try {
            emit.next(chunk)
          } catch {
            isActive = false
          }
        }
        const safeError = (err: Error) => {
          if (!isActive) return
          try {
            emit.error(err)
          } catch {
            isActive = false
          }
        }
        const safeComplete = () => {
          if (!isActive) return
          try {
            emit.complete()
          } catch {
            isActive = false
          }
        }

        ;(async () => {
          try {
            // 自动获取 MCP 工具并转换为 OpenAI 格式
            const openaiTools = await getOpenAITools()
            if (openaiTools.length > 0) {
              console.log(`[OpenAI Tools] Loaded ${openaiTools.length} MCP tools for custom model`)
            }

            // Build system prompt with working directory
            const systemPrompt = input.cwd
              ? `${CODING_ASSISTANT_SYSTEM_PROMPT} ${input.cwd}`
              : CODING_ASSISTANT_SYSTEM_PROMPT

            // Build full message history if messages provided, otherwise use single prompt
            const messages = input.messages && input.messages.length > 0
              ? input.messages.map((m: any) => ({
                  role: m.role as "user" | "assistant" | "system",
                  content: typeof m.content === "string" ? m.content : "",
                }))
              : [{ role: "user" as const, content: input.prompt }]

            // 300s timeout for streaming requests (longer for coding tasks)
            const abortSignal = AbortSignal.timeout(300000)

            const generator = streamOpenAI(
              {
                model: input.model,
                token: input.token,
                baseUrl: input.baseUrl,
                requestTemplate: input.requestTemplate,
              },
              messages,
              systemPrompt,
              abortSignal,
              input.images,
              openaiTools,
            )

            for await (const chunk of generator) {
              if (!isActive) break // Stop if observable closed
              safeEmit(chunk)
            }
          } catch (err: any) {
            console.error("[OpenAI Chat] Error:", err)
            safeError(err)
          } finally {
            safeComplete()
          }
        })()

        // Cleanup on unsubscribe
        return () => {
          isActive = false
        }
      })
    }),

  // Test connection endpoint (runs in main process, no CORS issues)
  test: publicProcedure
    .input(
      z.object({
        model: z.string(),
        token: z.string(),
        baseUrl: z.string(),
        requestTemplate: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // 直接使用用户填写的完整 API 地址
        const apiUrl = input.baseUrl

        const body = input.requestTemplate
          ? (() => {
              let t = input.requestTemplate
              // 如果有 {user_input} 占位符，替换它
              if (t.includes("{user_input}")) {
                t = t.replace(/\{user_input\}/g, "Hi")
              }
              // 替换 model 字段（使用安全方式）
              try {
                t = t.replace(/"model":\s*"[^"]*"/, `"model": "${input.model.replace(/"/g, '\\"')}"`)
              } catch {
                // If regex fails, skip model replacement
              }
              // 验证生成的 JSON 是否有效
              try {
                JSON.parse(t)
              } catch (parseErr: any) {
                throw new Error(`Invalid request template JSON after substitution: ${parseErr.message}. Template: ${t.slice(0, 200)}`)
              }
              return t
            })()
          : JSON.stringify({
              model: input.model,
              messages: [{ role: "user", content: "Hi" }],
              max_tokens: 1,
              stream: false,
            })

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.token}`,
          },
          body,
          signal: AbortSignal.timeout(15000),
        })

        return { ok: response.ok, status: response.status }
      } catch (err: any) {
        return { ok: false, status: 0, error: err.message }
      }
    }),
})
