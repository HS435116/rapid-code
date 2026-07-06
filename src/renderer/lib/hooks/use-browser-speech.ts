import { useState, useRef, useCallback, useEffect } from "react"

interface UseBrowserSpeechReturn {
  isListening: boolean
  isSupported: boolean
  error: Error | null
  interimText: string
  finalText: string
  startListening: () => void
  stopListening: () => Promise<string>
  cancelListening: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition
    webkitSpeechRecognition?: typeof SpeechRecognition
  }
}

/**
 * Hook for browser-based speech recognition using the Web Speech API
 *
 * Uses the browser's built-in SpeechRecognition API (available in Chromium/Electron)
 * No API keys required - works entirely offline/on-device
 *
 * Falls back automatically: starts listening and returns transcribed text on stop.
 */
export function useBrowserSpeech(language = "zh-CN"): UseBrowserSpeechReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [interimText, setInterimText] = useState("")
  const [finalText, setFinalText] = useState("")

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef("")
  const resolveRef = useRef<((text: string) => void) | null>(null)
  const rejectRef = useRef<((err: Error) => void) | null>(null)
  const isActiveRef = useRef(false)

  // Check browser support
  const SpeechRecognitionAPI =
    window.SpeechRecognition || window.webkitSpeechRecognition
  const isSupported = !!SpeechRecognitionAPI

  // Cleanup
  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // Ignore
      }
      recognitionRef.current = null
    }
    isActiveRef.current = false
    resolveRef.current = null
    rejectRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError(new Error("Speech recognition is not supported in this browser"))
      return
    }

    if (isActiveRef.current) {
      console.warn("[BrowserSpeech] Already listening")
      return
    }

    setError(null)
    setInterimText("")
    setFinalText("")
    finalTranscriptRef.current = ""

    try {
      const recognition = new SpeechRecognitionAPI()

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = language
      recognition.maxAlternatives = 1

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ""
        let final = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            final += result[0].transcript
          } else {
            interim += result[0].transcript
          }
        }

        if (final) {
          finalTranscriptRef.current += final
          setFinalText(finalTranscriptRef.current)
        }
        setInterimText(interim)
      }

      recognition.onerror = (event) => {
        console.error("[BrowserSpeech] Error:", event.error)

        let errMsg: string
        switch (event.error) {
          case "no-speech":
            errMsg = "No speech detected"
            break
          case "aborted":
            errMsg = "Speech recognition was aborted"
            break
          case "audio-capture":
            errMsg = "No microphone found"
            break
          case "not-allowed":
            errMsg = "Microphone access denied"
            break
          case "network":
            errMsg = "Network error (speech recognition service unavailable)"
            break
          case "language-not-supported":
            errMsg = `Language "${language}" is not supported`
            break
          case "service-not-allowed":
            errMsg = "Speech recognition service not allowed"
            break
          default:
            errMsg = `Speech recognition error: ${event.error}`
        }

        const err = new Error(errMsg)
        setError(err)
        rejectRef.current?.(err)
        cleanup()
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
        // If we have a pending resolve and recognition ended naturally
        if (resolveRef.current && finalTranscriptRef.current) {
          const text = finalTranscriptRef.current.trim()
          resolveRef.current(text)
          resolveRef.current = null
          rejectRef.current = null
        }
        isActiveRef.current = false
      }

      recognitionRef.current = recognition
      isActiveRef.current = true
      recognition.start()
      setIsListening(true)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to start speech recognition")
      setError(error)
      setIsListening(false)
      isActiveRef.current = false
    }
  }, [SpeechRecognitionAPI, language])

  const stopListening = useCallback(async (): Promise<string> => {
    if (!recognitionRef.current || !isActiveRef.current) {
      return finalTranscriptRef.current.trim()
    }

    return new Promise<string>((resolve, reject) => {
      // If we already have final text, resolve immediately
      if (finalTranscriptRef.current.trim()) {
        try {
          recognitionRef.current?.stop()
        } catch {
          // Ignore
        }
        cleanup()
        setIsListening(false)
        resolve(finalTranscriptRef.current.trim())
        return
      }

      // Set up resolve/reject for the onend callback
      resolveRef.current = resolve
      rejectRef.current = reject

      // Set a timeout to avoid hanging if onend doesn't fire
      setTimeout(() => {
        if (resolveRef.current) {
          const text = finalTranscriptRef.current.trim()
          resolveRef.current(text)
          resolveRef.current = null
          rejectRef.current = null
        }
      }, 3000)

      try {
        recognitionRef.current?.stop()
      } catch (err) {
        cleanup()
        setIsListening(false)
        reject(err instanceof Error ? err : new Error("Failed to stop recognition"))
      }
    })
  }, [cleanup])

  const cancelListening = useCallback(() => {
    cleanup()
    setIsListening(false)
    setInterimText("")
    setFinalText("")
    finalTranscriptRef.current = ""
  }, [cleanup])

  return {
    isListening,
    isSupported,
    error,
    interimText,
    finalText,
    startListening,
    stopListening,
    cancelListening,
  }
}
