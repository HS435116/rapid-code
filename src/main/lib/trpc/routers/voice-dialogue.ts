import { z } from "zod"
import { publicProcedure, router } from "../index"
import { getVoiceDialogue } from "../../voice/dialogue"
import { checkVoiceDeps } from "../../voice/check-deps"

/**
 * Voice Dialogue tRPC router
 * Provides local ASR (Whisper) and TTS (Kokoro/SAPI) endpoints
 */
export const voiceDialogueRouter = router({
  /** Check if local voice dependencies are installed */
  checkDeps: publicProcedure.query(async () => {
    return await checkVoiceDeps()
  }),

  /** Transcribe audio using local faster-whisper */
  transcribeLocal: publicProcedure
    .input(
      z.object({
        audio: z.string(), // base64 encoded audio
        format: z.string().default("webm"),
        language: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const audioBuffer = Buffer.from(input.audio, "base64")
      const dialogue = getVoiceDialogue()

      dialogue.updateConfig({
        asrLanguage: input.language || "zh",
      })

      const text = await dialogue.transcribe(audioBuffer, input.format)
      return { text }
    }),

  /** Synthesize text to speech and play it */
  synthesize: publicProcedure
    .input(
      z.object({
        text: z.string(),
        engine: z.enum(["kokoro", "sapi"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const dialogue = getVoiceDialogue()
      await dialogue.speak(input.text)
      return { success: true }
    }),

  /** Get current voice dialogue config */
  getConfig: publicProcedure.query(() => {
    return getVoiceDialogue().getConfig()
  }),

  /** Update voice dialogue config */
  setConfig: publicProcedure
    .input(
      z.object({
        asrModel: z.enum(["tiny", "base", "small", "medium", "large"]).optional(),
        asrLanguage: z.string().nullable().optional(),
        ttsEngine: z.enum(["kokoro", "sapi"]).optional(),
        ttsVoice: z.string().optional(),
        autoSendAfterTranscribe: z.boolean().optional(),
        autoTtsResponse: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const dialogue = getVoiceDialogue()
      dialogue.updateConfig(input)
      return { success: true }
    }),
})
