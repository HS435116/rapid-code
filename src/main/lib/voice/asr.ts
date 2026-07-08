import { execFile } from "child_process"
import { join } from "path"
import { app } from "electron"
import { writeFileSync, unlinkSync } from "fs"
import type { AsrResult } from "./types"

/**
 * Transcribe audio using local faster-whisper via Python wrapper.
 * Falls back to the built-in cloud-based transcription if local ASR is unavailable.
 */
export async function transcribeLocal(
  audioBuffer: Buffer,
  format: string,
  options?: {
    model?: "tiny" | "base" | "small" | "medium" | "large"
    language?: string | null
  },
): Promise<AsrResult> {
  const pythonCmd = await findPython()
  if (!pythonCmd) {
    return { text: "", error: "Python not found. Please install Python 3." }
  }

  // Save audio buffer to temp file
  const ext = format === "webm" ? ".webm" : format === "wav" ? ".wav" : format === "mp3" ? ".mp3" : ".webm"
  const tempDir = app.getPath("temp")
  const tempAudio = join(tempDir, `voice_asr_${Date.now()}${ext}`)
  writeFileSync(tempAudio, audioBuffer)

  try {
    const scriptPath = getScriptPath("asr.py")
    const args = [scriptPath, tempAudio, "--model", options?.model || "base"]
    if (options?.language) {
      args.push("--language", options.language)
    }

    const text = await runPython(pythonCmd, args)
    const result: AsrResult = JSON.parse(text)

    if (!result.text && result.error) {
      console.error("[LocalASR] Error:", result.error)
    }

    return result
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error("[LocalASR] Failed:", errorMsg)
    return { text: "", error: errorMsg }
  } finally {
    try {
      unlinkSync(tempAudio)
    } catch {
      // Temp file cleanup is best-effort
    }
  }
}

/**
 * Check if local ASR is available (Python + faster-whisper installed).
 */
export async function checkAsrAvailable(): Promise<boolean> {
  try {
    const pythonCmd = await findPython()
    if (!pythonCmd) return false

    const scriptPath = getScriptPath("asr.py")
    const text = await runPython(pythonCmd, [
      scriptPath,
      "--help",
    ])
    return text.includes("Local ASR")
  } catch {
    return false
  }
}

async function findPython(): Promise<string | null> {
  // First try full paths to known Python installations (avoids WindowsApps shim issues)
  const pythonPaths = [
    "C:\\Python314\\python.exe",
    "C:\\Python313\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe",
    "C:\\Python310\\python.exe",
    `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python314\\python.exe`,
    `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python313\\python.exe`,
    `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python312\\python.exe`,
    `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python311\\python.exe`,
  ]
  for (const p of pythonPaths) {
    try {
      await runCommand(p, ["--version"])
      return p
    } catch {
      continue
    }
  }
  // Fallback: try PATH commands
  for (const cmd of ["python3", "python"]) {
    try {
      await runCommand(cmd, ["--version"])
      return cmd
    } catch {
      continue
    }
  }
  return null
}

function getScriptPath(name: string): string {
  // In dev mode: scripts/voice/name, in production: bundled with resources
  if (!app.isPackaged) {
    return join(app.getAppPath(), "scripts", "voice", name)
  }
  return join(process.resourcesPath, "scripts", "voice", name)
}

function runPython(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, {
      timeout: 120_000, // 2 min timeout for transcription
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        http_proxy: "",
        https_proxy: "",
        NO_PROXY: "*",
      },
    }, (error, stdout, stderr) => {
      if (error) {
        // Python script might have written error to stdout as JSON
        if (stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout)
            if (parsed.error) {
              reject(new Error(parsed.error))
              return
            } else if (parsed.text !== undefined) {
              resolve(stdout)
              return
            }
          } catch {
            // Not JSON, treat as error
          }
        }
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}
