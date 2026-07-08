import { BrowserWindow } from "electron"
import { transcribeLocal } from "./asr"
import { synthesize } from "./tts"
import { checkVoiceDeps } from "./check-deps"
import type { VoiceDepsStatus, VoiceDialogueConfig } from "./types"

/**
 * Voice Dialogue Orchestrator
 *
 * Manages the full voice conversation loop:
 *   1. Record audio → 2. ASR (local) → 3. Send to Claude → 4. TTS response → 5. Play audio
 *
 * Usage:
 *   const dialogue = new VoiceDialogue()
 *   await dialogue.transcribe(audioBuffer)  // ASR only
 *   await dialogue.speak(text)              // TTS only
 */

export class VoiceDialogue {
  private config: VoiceDialogueConfig = {
    asrModel: "base",
    asrLanguage: "zh",
    ttsEngine: "sapi",
    ttsVoice: "af_bella",
    autoSendAfterTranscribe: true,
    autoTtsResponse: true,
  }

  private depsChecked = false
  private depsStatus: VoiceDepsStatus | null = null

  constructor(config?: Partial<VoiceDialogueConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /** Update config */
  updateConfig(config: Partial<VoiceDialogueConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** Get current config */
  getConfig(): VoiceDialogueConfig {
    return { ...this.config }
  }

  /** Check and cache dependency status */
  async checkDeps(force = false): Promise<VoiceDepsStatus> {
    if (!this.depsChecked || force) {
      this.depsStatus = await checkVoiceDeps()
      this.depsChecked = true
    }
    return this.depsStatus!
  }

  /** Transcribe audio buffer to text using local ASR */
  async transcribe(audioBuffer: Buffer, format: string): Promise<string> {
    const deps = await this.checkDeps()

    if (!deps.asrAvailable) {
      const missing = []
      if (!deps.python) missing.push("Python 3")
      if (!deps.fasterWhisper) missing.push("faster-whisper")
      throw new Error(`本地语音识别不可用，缺少: ${missing.join(", ")}`)
    }

    const result = await transcribeLocal(audioBuffer, format, {
      model: this.config.asrModel,
      language: this.config.asrLanguage,
    })

    if (result.error) {
      throw new Error(result.error)
    }

    return result.text
  }

  /** Synthesize text to speech and play it */
  async speak(text: string): Promise<void> {
    const deps = await this.checkDeps()

    if (!deps.ttsAvailable) {
      throw new Error("本地语音合成不可用")
    }

    const result = await synthesize(text, {
      engine: this.config.ttsEngine,
      voice: this.config.ttsVoice,
    })

    if (result.error) {
      console.error("[VoiceDialogue] TTS error:", result.error)
      return
    }

    // Send audio to all windows for playback
    this.sendAudioToWindows(result.audioBase64, result.format)
  }

  /** Send audio to renderer for playback */
  private sendAudioToWindows(audioBase64: string, format: string): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("voice:play-audio", {
          audioBase64,
          format,
        })
      }
    }
  }
}

// Singleton instance
let instance: VoiceDialogue | null = null

export function getVoiceDialogue(): VoiceDialogue {
  if (!instance) {
    instance = new VoiceDialogue()
  }
  return instance
}
