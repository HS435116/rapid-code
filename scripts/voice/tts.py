#!/usr/bin/env python3
"""
Local TTS (Text-to-Speech) using Kokoro or Windows SAPI fallback.
Usage: python tts.py <text> [--voice VOICE] [--output OUTPUT]
       python tts.py --file <text_file> [--voice VOICE] [--output OUTPUT]
Returns: JSON with audio file path
"""
import argparse
import json
import os
import sys
import tempfile
import wave


def tts_kokoro(text: str, voice: str = "af_bella", output_path: str = None) -> dict:
    """Synthesize speech using Kokoro TTS."""
    try:
        from kokoro import KPipeline
        import soundfile as sf
    except ImportError:
        return {"error": "kokoro not installed. Run: pip install kokoro", "text": ""}

    if not output_path:
        output_path = os.path.join(tempfile.gettempdir(), f"kokoro_tts_{abs(hash(text))}.wav")

    try:
        pipeline = KPipeline(lang_code=voice[0])  # 'a' for American English, 'b' for British, etc.
        generator = pipeline(text, voice=voice, speed=1.0)

        all_audio = []
        for i, (graphemes, phonemes, audio) in enumerate(generator):
            all_audio.append(audio)

        if all_audio:
            import numpy as np
            combined = np.concatenate(all_audio)
            sf.write(output_path, combined, 24000)
            return {"audio_path": output_path, "format": "wav", "engine": "kokoro"}
        else:
            return {"error": "No audio generated", "text": ""}
    except Exception as e:
        return {"error": f"Kokoro TTS failed: {str(e)}", "text": ""}


def tts_sapi_windows(text: str, output_path: str = None) -> dict:
    """Synthesize speech using Windows SAPI (built-in, no deps needed)."""
    if not output_path:
        output_path = os.path.join(tempfile.gettempdir(), f"sapi_tts_{abs(hash(text))}.wav")

    try:
        import subprocess
        # PowerShell script using System.Speech
        ps_script = f'''
        Add-Type -AssemblyName System.Speech
        $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $speak.SetOutputToWaveFile("{output_path}")
        $speak.Speak(''' + text.replace("'", "''") + ''')
        $speak.Dispose()
        '''
        subprocess.run(["powershell", "-Command", ps_script], check=True, capture_output=True, timeout=30)

        if os.path.exists(output_path):
            return {"audio_path": output_path, "format": "wav", "engine": "sapi"}
        else:
            return {"error": "SAPI failed to generate audio", "text": ""}
    except subprocess.TimeoutExpired:
        return {"error": "SAPI timed out", "text": ""}
    except Exception as e:
        return {"error": f"SAPI TTS failed: {str(e)}", "text": ""}


def tts(text: str, voice: str = "auto", output_path: str = None, prefer: str = "kokoro") -> dict:
    """TTS with Kokoro as primary, Windows SAPI as fallback."""
    if prefer == "kokoro":
        result = tts_kokoro(text, voice, output_path)
        if "error" not in result:
            return result
        if sys.platform == "win32":
            return tts_sapi_windows(text, output_path)
        return result
    else:
        if sys.platform == "win32":
            return tts_sapi_windows(text, output_path)
        return {"error": "No TTS engine available on this platform", "text": ""}


def main():
    parser = argparse.ArgumentParser(description="Local TTS")
    parser.add_argument("text", nargs="?", help="Text to synthesize")
    parser.add_argument("--file", help="Read text from file")
    parser.add_argument("--voice", default="af_bella",
                        help="Voice (Kokoro) or 'auto' for SAPI (default: af_bella)")
    parser.add_argument("--output", help="Output WAV file path")
    parser.add_argument("--engine", default="kokoro", choices=["kokoro", "sapi"],
                        help="TTS engine (default: kokoro, falls back to sapi)")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read().strip()
    elif args.text:
        text = args.text
    else:
        print(json.dumps({"error": "No text provided", "text": ""}))
        sys.exit(1)

    result = tts(text, args.voice, args.output, args.engine)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
