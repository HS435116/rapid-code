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

// Web Speech API types not included in standard TS DOM lib
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
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
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
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

	      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
	        console.warn("[BrowserSpeech] Error:", event.error)

	        // "no-speech" is normal silence timeout — restart after a short delay
	        if (event.error === "no-speech" && isActiveRef.current) {
	          setTimeout(() => {
	            if (!isActiveRef.current) return
	            try {
	              const newRec = new SpeechRecognitionAPI()
	              newRec.continuous = true
	              newRec.interimResults = true
	              newRec.lang = language
	              newRec.maxAlternatives = 1
	              newRec.onresult = recognition.onresult
	              newRec.onerror = recognition.onerror
	              newRec.onend = recognition.onend
	              recognitionRef.current = newRec
	              newRec.start()
	            } catch {
	              // If restart fails, stop cleanly
	              isActiveRef.current = false
	              setIsListening(false)
	            }
	          }, 300)
	          return
	        }

	        let errMsg: string
	        switch (event.error) {
	          case "aborted":
	            errMsg = "语音识别已中断"
	            break
	          case "audio-capture":
	            errMsg = "未找到麦克风，请连接麦克风设备"
	            break
	          case "not-allowed":
	            errMsg = "麦克风权限被拒绝，请在系统设置中允许麦克风访问"
	            break
	          case "network":
	            errMsg = "语音识别网络错误。请检查代理设置：运行 set HTTP_PROXY= && set HTTPS_PROXY= 清除代理环境变量后重试"
	            break
	          case "language-not-supported":
	            errMsg = `语言 "${language}" 不受支持`
	            break
	          case "service-not-allowed":
	            errMsg = "语音识别服务未授权"
	            break
	          default:
	            errMsg = `语音识别错误: ${event.error}`
	        }

	        const err = new Error(errMsg)
	        setError(err)
	        // Notify the reject callback so stopListening() can surface the error
	        if (rejectRef.current) {
	          rejectRef.current(err)
	          rejectRef.current = null
	          resolveRef.current = null
	        }
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
