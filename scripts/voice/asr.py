#!/usr/bin/env python3
"""
Local ASR (Automatic Speech Recognition).
Supports: faster-whisper (primary), whisper (fallback).
Usage: python asr.py <audio_path> [--model MODEL] [--language LANG]
Returns: JSON with transcribed text
"""
import argparse
import json
import os
import sys
import time


def transcribe_faster_whisper(audio_path: str, model_size: str, language: str = None) -> dict:
    """Transcribe using faster-whisper (faster, lower memory)."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None  # Fall through to next backend

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        start = time.time()
        segments, info = model.transcribe(audio_path, language=language, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments)
        return {
            "text": text,
            "duration_s": round(time.time() - start, 2),
            "language": info.language if info else None,
            "model": model_size,
            "engine": "faster-whisper",
        }
    except Exception as e:
        return {"error": f"faster-whisper failed: {str(e)}", "text": "", "engine": "faster-whisper"}


def transcribe_whisper(audio_path: str, model_size: str, language: str = None) -> dict:
    """Transcribe using openai-whisper (more compatible with Python 3.14)."""
    try:
        import whisper
    except ImportError:
        return {"error": "whisper not installed. Run: pip install openai-whisper", "text": ""}

    try:
        model = whisper.load_model(model_size)
        start = time.time()
        result = model.transcribe(audio_path, language=language, fp16=False)
        return {
            "text": result.get("text", "").strip(),
            "duration_s": round(time.time() - start, 2),
            "language": result.get("language", language),
            "model": model_size,
            "engine": "openai-whisper",
        }
    except Exception as e:
        return {"error": f"whisper failed: {str(e)}", "text": "", "engine": "openai-whisper"}


def transcribe(audio_path: str, model_size: str = "base", language: str = None) -> dict:
    """Transcribe audio using best available backend."""
    if not os.path.exists(audio_path):
        return {"error": f"Audio file not found: {audio_path}", "text": ""}

    # Try faster-whisper first, fall back to openai-whisper
    result = transcribe_faster_whisper(audio_path, model_size, language)
    if result is not None:
        return result

    return transcribe_whisper(audio_path, model_size, language)


def main():
    parser = argparse.ArgumentParser(description="Local ASR")
    parser.add_argument("audio_path", help="Path to audio file (WAV/MP3/OGG/WebM)")
    parser.add_argument("--model", default="base",
                        choices=["tiny", "base", "small", "medium", "large"],
                        help="Whisper model size (default: base)")
    parser.add_argument("--language", default=None,
                        help="Language code (zh, en, ja... Auto-detect if omitted)")
    args = parser.parse_args()

    result = transcribe(args.audio_path, args.model, args.language)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
