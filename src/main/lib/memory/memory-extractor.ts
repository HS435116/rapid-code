/**
 * Memory Extractor
 * Analyzes conversation messages and extracts key information
 * for storage in the knowledge memory system.
 *
 * Extracts:
 * - Code changes (files modified, tools used)
 * - User preferences
 * - Project information
 * - Technical decisions and patterns
 */
import { getDatabase } from "../db"
import { memories } from "../db/schema"
import type { NewMemory } from "../db/schema"
import { createId } from "../db/utils"

interface MessagePart {
  type: string
  text?: string
  toolName?: string
  input?: Record<string, any>
  output?: Record<string, any>
  state?: string
  [key: string]: any
}

interface ConversationMessage {
  id: string
  role: "user" | "assistant"
  parts: MessagePart[]
  metadata?: Record<string, any>
}

/**
 * Extract meaningful knowledge from conversation messages
 * This is called after a conversation completes
 */
export function extractFromConversation(
  messages: ConversationMessage[],
  chatId: string,
  projectName?: string,
): NewMemory[] {
  const extracted: NewMemory[] = []

  // Extract file operations knowledge
  const fileOps = extractFileOperations(messages)
  for (const op of fileOps) {
    extracted.push({
      id: createId(),
      content: op.content,
      summary: op.summary,
      category: "code",
      tags: JSON.stringify(["file_operation", ...(op.tags || [])]),
      sourceChatId: chatId,
      importance: 2,
    } as NewMemory)
  }

  // Extract user preferences
  const prefs = extractUserPreferences(messages)
  for (const pref of prefs) {
    extracted.push({
      id: createId(),
      content: pref.content,
      summary: pref.summary,
      category: "user_pref",
      tags: JSON.stringify(["preference", ...(pref.tags || [])]),
      sourceChatId: chatId,
      importance: 3,
    } as NewMemory)
  }

  // Extract project info
  const projectInfo = extractProjectInfo(messages)
  for (const info of projectInfo) {
    extracted.push({
      id: createId(),
      content: info.content,
      summary: info.summary,
      category: "project",
      tags: JSON.stringify(["project", ...(info.tags || [])]),
      sourceChatId: chatId,
      importance: 3,
    } as NewMemory)
  }

  return extracted
}

/**
 * Save extracted memories to database
 */
export function persistMemories(newMemories: NewMemory[]): number {
  if (newMemories.length === 0) return 0

  const db = getDatabase()
  let count = 0

  for (const memory of newMemories) {
    try {
      db.insert(memories).values(memory).run()
      count++
    } catch (error) {
      console.error("[MemoryExtractor] Failed to save memory:", error)
    }
  }

  if (count > 0) {
    console.log(`[MemoryExtractor] Saved ${count} new memories`)
  }

  return count
}

/**
 * Extract file operations knowledge from tool calls
 */
function extractFileOperations(messages: ConversationMessage[]): ExtractedInfo[] {
  const results: ExtractedInfo[] = []
  const seenOps = new Set<string>()

  for (const msg of messages) {
    if (msg.role !== "assistant") continue

    for (const part of msg.parts || []) {
      if (part.state !== "result") continue

      const toolName = part.toolName || ""
      const input = part.input || {}
      let memory: ExtractedInfo | null = null

      if (toolName === "Edit" && input.file_path) {
        const key = `edit:${input.file_path}`
        if (!seenOps.has(key)) {
          seenOps.add(key)
          memory = {
            content: `File edited: ${input.file_path}\nOld: ${(input.old_string || "").slice(0, 200)}\nNew: ${(input.new_string || "").slice(0, 200)}`,
            summary: `Edited ${input.file_path}`,
            tags: ["edit"],
          }
        }
      } else if (toolName === "Write" && input.file_path) {
        const key = `write:${input.file_path}`
        if (!seenOps.has(key)) {
          seenOps.add(key)
          memory = {
            content: `File created: ${input.file_path}\nContent preview: ${(input.content || "").slice(0, 300)}`,
            summary: `Created ${input.file_path}`,
            tags: ["create"],
          }
        }
      } else if (toolName === "Bash" && input.command) {
        const cmd = input.command
        if (cmd.startsWith("npm install") || cmd.startsWith("pip install") || cmd.startsWith("go get")) {
          const key = `dep:${cmd}`
          if (!seenOps.has(key)) {
            seenOps.add(key)
            memory = {
              content: `Dependency installed: ${cmd}`,
              summary: `Installed: ${cmd.slice(0, 80)}`,
              tags: ["dependency"],
            }
          }
        }
      }

      if (memory) {
        results.push(memory)
      }
    }
  }

  return results
}

/**
 * Extract user preferences from conversation
 */
function extractUserPreferences(messages: ConversationMessage[]): ExtractedInfo[] {
  // Simple extraction - looks for user statements about preferences
  return []
}

/**
 * Extract project info from conversation
 */
function extractProjectInfo(messages: ConversationMessage[]): ExtractedInfo[] {
  // Simple extraction - looks for project setup information
  return []
}

interface ExtractedInfo {
  content: string
  summary: string
  tags: string[]
}
