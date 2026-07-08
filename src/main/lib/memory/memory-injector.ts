/**
 * Memory Injector
 * Retrieves relevant memories and formats them as context for AI prompts.
 *
 * Used by:
 * - claude.ts router (Ollama context construction)
 * - openai-handler.ts (system prompt enrichment)
 * - openai-chat.ts (custom model context)
 */
import { like, and, desc, sql, eq } from "drizzle-orm"
import { getDatabase } from "../db"
import { memories } from "../db/schema"

/**
 * Retrieve memories relevant to the given prompt text
 * Returns formatted memory context string
 */
export function getMemoryContext(prompt: string, limit: number = 5): string {
  try {
    // Extract keywords from prompt
    const keywords = extractKeywords(prompt)
    if (keywords.length === 0) return ""

    const db = getDatabase()

    // Build search conditions
    const conditions = keywords.map(kw =>
      sql`(${like(memories.content, `%${kw}%`)} OR ${like(memories.summary, `%${kw}%`)})`
    )

    const results = db
      .select()
      .from(memories)
      .where(conditions.length > 0 ? conditions.reduce((a, b) => and(a, b)) : undefined)
      .orderBy(desc(memories.importance), desc(memories.createdAt))
      .limit(limit)
      .all()

    if (results.length === 0) return ""

    // Format as knowledge context block
    const lines = ['[KNOWLEDGE MEMORY]']
    lines.push('The following is information you previously learned and stored:')
    lines.push('')

    for (const mem of results) {
      try {
        const tags = JSON.parse(mem.tags || "[]")
        const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : ""
        lines.push(`--- Memory (${mem.category}${tagStr}) ---`)
        lines.push(mem.content)
        lines.push('')
      } catch {
        lines.push(`--- Memory (${mem.category}) ---`)
        lines.push(mem.content)
        lines.push('')
      }
    }

    lines.push('[/KNOWLEDGE MEMORY]')
    return lines.join('\n')
  } catch (error) {
    console.error("[MemoryInjector] Error retrieving memories:", error)
    return ""
  }
}

/**
 * Extract meaningful keywords from text for memory retrieval
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "this", "that", "with", "from", "what", "when", "where", "which",
    "there", "their", "about", "would", "could", "should", "have",
    "been", "were", "being", "does", "just", "also", "very", "well",
    "even", "than", "then", "they", "them", "some", "such", "only",
    "more", "most", "other", "into", "over", "after", "before",
    "between", "under", "above", "below", "your", "will", "tell",
    "made", "make", "like", "know", "take", "think", "come", "want",
    "give", "find", "need", "help", "look", "work", "call", "try",
    "ask", "use", "show", "keep", "set", "put", "end", "let", "begin",
    "open", "move", "live", "play", "run", "move", "turn", "help",
    "please", "can", "you", "the", "and", "for", "are", "not", "but",
    "has", "was", "had", "have", "been", "get", "got", "may", "say",
    "each", "tell", "does", "set", "new", "then", "him", "see", "way",
    "who", "now", "its", "how", "all", "any", "two", "use", "our",
  ])

  return text
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}\/\\'"]+/)
    .filter(w => w.length > 3)
    .filter(w => !stopWords.has(w))
    .slice(0, 15)
}
