import { execFile } from "child_process"
import type { VoiceDepsStatus } from "./types"

/**
 * Check all voice dependencies and return status.
 */
export async function checkVoiceDeps(): Promise<VoiceDepsStatus> {
  const result: VoiceDepsStatus = {
    python: false,
    fasterWhisper: false,
    openaiWhisper: false,
    kokoro: false,
    sapiAvailable: process.platform === "win32",
    asrAvailable: false,
    ttsAvailable: false,
    allAvailable: false,
  }

  // Check Python
  const pythonCmd = await findPython()
  console.log("[VoiceDeps] Python command:", pythonCmd)
  if (pythonCmd) {
    result.python = true
    result.pythonVersion = await getPythonVersion(pythonCmd)

    // Check ASR backends
    result.fasterWhisper = await checkModule(pythonCmd, "faster_whisper")
    result.openaiWhisper = await checkModule(pythonCmd, "whisper")
    console.log("[VoiceDeps] faster-whisper:", result.fasterWhisper, "openai-whisper:", result.openaiWhisper)

    // Check kokoro
    result.kokoro = await checkModule(pythonCmd, "kokoro")
  }

  // ASR is available if Python + faster-whisper
  result.asrAvailable = result.python && (result.fasterWhisper || result.openaiWhisper)

  // TTS is available if Windows SAPI or Python + kokoro
  result.ttsAvailable = result.sapiAvailable || (result.python && result.kokoro)

  // Everything available
  result.allAvailable = result.asrAvailable && result.ttsAvailable

  return result
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
      console.log("[VoiceDeps] Found Python at:", p)
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

async function getPythonVersion(cmd: string): Promise<string> {
  try {
    const out = await runCommand(cmd, ["--version"])
    return out.trim()
  } catch {
    return "unknown"
  }
}

async function checkModule(cmd: string, module: string): Promise<boolean> {
  try {
    // Use find_spec instead of full import (much faster - doesn't load the module)
    await runCommand(cmd, ["-c", `import importlib.util; print(importlib.util.find_spec('${module}') is not None)`])
    return true
  } catch {
    return false
  }
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: 5_000, // 5s for module checks (find_spec is fast)
      env: {
        ...process.env,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "*",
      },
    }, (error, stdout, stderr) => {
      if (error) {
        console.error("[VoiceDeps] runCommand error:", error.message)
        if (stderr) console.error("[VoiceDeps] stderr:", stderr.trim().slice(0, 200))
        reject(error)
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
