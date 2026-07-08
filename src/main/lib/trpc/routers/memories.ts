/**
 * Memories tRPC Router
 * Provides CRUD operations for the knowledge memory system
 */
import { z } from "zod"
import { eq, like, desc, and, sql } from "drizzle-orm"
import { getDatabase } from "../../db"
import { memories } from "../../db/schema"
import type { Memory, NewMemory } from "../../db/schema"
import { publicProcedure, router } from "../index"

// Validation schemas
const createMemorySchema = z.object({
  content: z.string().min(1),
  summary: z.string().min(1).max(500),
  category: z.enum(["general", "code", "user_pref", "project", "tech"]).default("general"),
  tags: z.array(z.string()).default([]),
  sourceChatId: z.string().optional(),
  sourceUrl: z.string().optional(),
  importance: z.number().int().min(1).max(5).default(1),
})

const updateMemorySchema = createMemorySchema.partial()

const searchMemoriesSchema = z.object({
  query: z.string().optional(),
  category: z.enum(["general", "code", "user_pref", "project", "tech"]).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

export const memoriesRouter = router({
  /**
   * List all memories with optional search/filter
   */
  list: publicProcedure
    .input(searchMemoriesSchema)
    .query(async ({ input }) => {
      const db = getDatabase()
      const conditions = []

      if (input.query) {
        conditions.push(
          sql`(${like(memories.content, `%${input.query}%`)} OR ${like(memories.summary, `%${input.query}%`)})`,
        )
      }
      if (input.category) {
        conditions.push(eq(memories.category, input.category))
      }
      if (input.tags && input.tags.length > 0) {
        // Search memories that have any of the specified tags
        for (const tag of input.tags) {
          conditions.push(like(memories.tags, `%"${tag}"%`))
        }
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const items = db
        .select()
        .from(memories)
        .where(where)
        .orderBy(desc(memories.importance), desc(memories.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all()

      const total = db
        .select({ count: sql<number>`count(*)` })
        .from(memories)
        .where(where)
        .get()

      return {
        items: items.map(m => ({
          ...m,
          tags: JSON.parse(m.tags || "[]"),
        })),
        total: total?.count || 0,
      }
    }),

  /**
   * Get a single memory by ID
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const item = db
        .select()
        .from(memories)
        .where(eq(memories.id, input.id))
        .get()

      if (!item) {
        throw new Error(`Memory not found: ${input.id}`)
      }

      return {
        ...item,
        tags: JSON.parse(item.tags || "[]"),
      }
    }),

  /**
   * Create a new memory entry
   */
  create: publicProcedure
    .input(createMemorySchema)
    .mutation(async ({ input }) => {
      const db = getDatabase()

      const newMemory: NewMemory = {
        content: input.content,
        summary: input.summary,
        category: input.category,
        tags: JSON.stringify(input.tags),
        sourceChatId: input.sourceChatId,
        sourceUrl: input.sourceUrl,
        importance: input.importance,
      }

      const id = db.insert(memories).values(newMemory).returning().get()
      console.log(`[Memory] Created: "${input.summary.slice(0, 60)}..." (${id.id})`)
      return { ...id, tags: input.tags }
    }),

  /**
   * Update an existing memory
   */
  update: publicProcedure
    .input(z.object({
      id: z.string(),
      data: updateMemorySchema,
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      const updateData: Record<string, any> = {}
      if (input.data.content !== undefined) updateData.content = input.data.content
      if (input.data.summary !== undefined) updateData.summary = input.data.summary
      if (input.data.category !== undefined) updateData.category = input.data.category
      if (input.data.tags !== undefined) updateData.tags = JSON.stringify(input.data.tags)
      if (input.data.importance !== undefined) updateData.importance = input.data.importance
      if (input.data.sourceUrl !== undefined) updateData.sourceUrl = input.data.sourceUrl
      updateData.updatedAt = new Date()

      db.update(memories)
        .set(updateData)
        .where(eq(memories.id, input.id))
        .run()

      const updated = db.select().from(memories).where(eq(memories.id, input.id)).get()
      return updated ? { ...updated, tags: JSON.parse(updated.tags || "[]") } : null
    }),

  /**
   * Delete a memory
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      db.delete(memories).where(eq(memories.id, input.id)).run()
      console.log(`[Memory] Deleted: ${input.id}`)
      return { success: true }
    }),

  /**
   * Search memories relevant to a given text (keyword-based)
   * Used by the memory injection system
   */
  searchRelevant: publicProcedure
    .input(z.object({ text: z.string(), limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ input }) => {
      const db = getDatabase()

      // Extract meaningful keywords (remove common words, take meaningful ones)
      const keywords = input.text
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
        .filter(w => !["this", "that", "with", "from", "what", "when", "where", "which", "there", "their", "about", "would", "could", "should", "have", "been", "were", "being", "does", "just", "also", "very", "well", "even", "than", "then", "they", "them", "some", "such", "only", "more", "most", "other", "into", "over", "after", "before", "between", "under", "above", "below", "your", "will", "tell", "made", "make", "like", "know", "take", "think", "come", "want", "give", "find", "need", "help", "look", "work", "call", "try", "ask", "use", "show", "keep", "set", "put", "end", "let", "begin", "open", "move", "live", "play", "run", "move", "turn", "help"].includes(w))
        .slice(0, 10)

      if (keywords.length === 0) {
        return { items: [] }
      }

      // Build search condition: match any keyword in content or summary
      const conditions = keywords.map(kw =>
        sql`(${like(memories.content, `%${kw}%`)} OR ${like(memories.summary, `%${kw}%`)})`
      )

      const results = db
        .select()
        .from(memories)
        .where(conditions.length > 0 ? conditions.reduce((a, b) => and(a, b)) : undefined)
        .orderBy(desc(memories.importance), desc(memories.createdAt))
        .limit(input.limit)
        .all()

      return {
        items: results.map(m => ({
          ...m,
          tags: JSON.parse(m.tags || "[]"),
        })),
      }
    }),

  /**
   * Get memory categories and their counts
   */
  getCategories: publicProcedure.query(async () => {
    const db = getDatabase()
    const results = db
      .select({
        category: memories.category,
        count: sql<number>`count(*)`,
      })
      .from(memories)
      .groupBy(memories.category)
      .all()

    return results
  }),
})
