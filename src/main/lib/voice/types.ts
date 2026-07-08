/** Result from ASR transcription */
export interface AsrResult {
  text: string
  error?: string
  duration_s?: number
  language?: string | null
  model?: string
}

/** Result from TTS synthesis */
export interface TtsResult {
  audio_path: string
  format: string
  engine: string
  error?: string
}

/** Status of voice dependencies */
export interface VoiceDepsStatus {
  python: boolean
  pythonVersion?: string
  fasterWhisper: boolean
  openaiWhisper: boolean
  kokoro: boolean
  /** Windows SAPI is always available on Windows */
  sapiAvailable: boolean
  /** Overall: at least ASR is available */
  asrAvailable: boolean
  /** Overall: at least one TTS engine is available */
  ttsAvailable: boolean
  allAvailable: boolean
}

/** Voice dialogue state */
export type DialogueState =
  | "idle"
  | "listening"
  | "transcribing"
  | "ai-thinking"
  | "speaking"
  | "error"

/** Configuration for voice dialogue */
export interface VoiceDialogueConfig {
  asrModel: "tiny" | "base" | "small" | "medium" | "large"
  asrLanguage: string | null
  ttsEngine: "kokoro" | "sapi"
  ttsVoice: string
  autoSendAfterTranscribe: boolean
  autoTtsResponse: boolean
}
