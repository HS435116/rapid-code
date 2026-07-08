/**
 * Auto-Learner
 * Automatically extracts knowledge from conversations after they complete.
 * Hooks into the message persistence flow.
 *
 * Triggered when:
 * - A conversation response finishes streaming
 * - A batch of messages is persisted
 */
import { extractFromConversation, persistMemories } from "./memory-extractor"

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
 * Called after conversation messages are persisted
 * Extracts knowledge and saves it to the memory store
 */
export function onConversationComplete(
  messages: ConversationMessage[],
  chatId: string,
  projectName?: string,
): void {
  if (!messages || messages.length < 2) return

  try {
    const extracted = extractFromConversation(messages, chatId, projectName)
    if (extracted.length > 0) {
      const count = persistMemories(extracted)
      if (count > 0) {
        console.log(`[AutoLearner] Extracted ${count} memories from conversation`)
      }
    }
  } catch (error) {
    console.error("[AutoLearner] Error extracting memories:", error)
  }
}
