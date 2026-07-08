import { execFile } from "child_process"
import { join } from "path"
import { app } from "electron"
import { readFileSync, unlinkSync } from "fs"
import type { TtsResult } from "./types"

/**
 * Synthesize text to speech using local TTS (Kokoro or Windows SAPI).
 * Returns a base64-encoded WAV audio that can be played in the renderer.
 */
export async function synthesize(
  text: string,
  options?: {
    engine?: "kokoro" | "sapi"
    voice?: string
  },
): Promise<{ audioBase64: string; format: string; error?: string }> {
  const pythonCmd = await findPython()
  if (!pythonCmd) {
    // If no Python, try Windows SAPI directly
    if (process.platform === "win32") {
      return synthesizeWithSapi(text)
    }
    return { audioBase64: "", format: "", error: "Python not found" }
  }

  try {
    const scriptPath = getScriptPath("tts.py")
    const engine = options?.engine || (await hasKokoro(pythonCmd) ? "kokoro" : "sapi")

    const args = [scriptPath, text, "--engine", engine]
    if (options?.voice) {
      args.push("--voice", options.voice)
    }

    const output = await runPython(pythonCmd, args)
    const result: TtsResult = JSON.parse(output)

    if (result.error || !result.audio_path) {
      return { audioBase64: "", format: "", error: result.error || "No audio generated" }
    }

    // Read the generated audio file as base64
    const audioBuffer = readFileSync(result.audio_path)
    const audioBase64 = audioBuffer.toString("base64")

    // Clean up temp file
    try {
      unlinkSync(result.audio_path)
    } catch {
      // Best-effort cleanup
    }

    return { audioBase64, format: result.format || "wav" }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error("[LocalTTS] Failed:", errorMsg)

    // Fallback: try SAPI directly
    if (process.platform === "win32") {
      return synthesizeWithSapi(text)
    }
    return { audioBase64: "", format: "", error: errorMsg }
  }
}

/**
 * Windows SAPI direct TTS (no Python needed).
 */
async function synthesizeWithSapi(text: string): Promise<{ audioBase64: string; format: string }> {
  const tempDir = app.getPath("temp")
  const outputPath = join(tempDir, `tts_sapi_${Date.now()}.wav`)

  // PowerShell script for SAPI
  const psScript = `
    Add-Type -AssemblyName System.Speech
    $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $speak.SetOutputToWaveFile("${outputPath.replace(/\\/g, '\\\\')}")
    $speak.Speak('${text.replace(/'/g, "''")}')
    $speak.Dispose()
  `

  return new Promise((resolve, reject) => {
    execFile("powershell", ["-Command", psScript], { timeout: 30_000 }, (error) => {
      if (error) {
        reject(new Error(`SAPI failed: ${error.message}`))
        return
      }
      try {
        const audioBuffer = readFileSync(outputPath)
        const audioBase64 = audioBuffer.toString("base64")
        try { unlinkSync(outputPath) } catch {}
        resolve({ audioBase64, format: "wav" })
      } catch (err) {
        reject(new Error(`Failed to read SAPI output: ${err}`))
      }
    })
  })
}

/**
 * Check if local TTS is available.
 */
export async function checkTtsAvailable(): Promise<boolean> {
  // Windows SAPI is always available
  if (process.platform === "win32") return true

  try {
    const pythonCmd = await findPython()
    if (!pythonCmd) return false
    return await hasKokoro(pythonCmd)
  } catch {
    return false
  }
}

async function hasKokoro(pythonCmd: string): Promise<boolean> {
  try {
    await runPython(pythonCmd, ["-c", "import kokoro; print('ok')"])
    return true
  } catch {
    return false
  }
}

async function findPython(): Promise<string | null> {
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
  if (!app.isPackaged) {
    return join(app.getAppPath(), "scripts", "voice", name)
  }
  return join(process.resourcesPath, "scripts", "voice", name)
}

function runPython(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "*",
      },
    }, (error, stdout, stderr) => {
      if (error) {
        if (stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout)
            if (parsed.audio_path) {
              resolve(stdout)
              return
            }
          } catch {}
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
