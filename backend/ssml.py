"""
HAILE Backend — SSML Generation & Phrase Detection

Converts GPT output to SSML for Azure Speech Avatar TTS,
and splits streaming text into speakable phrases.
"""

import re
from typing import List, Tuple

VOICE_NAME = "en-US-AndrewMultilingualNeural"

# Mood → mstts:express-as style mapping
MOOD_TO_STYLE = {
    "cheerful": ("cheerful", "1.2"),
    "excited": ("excited", "1.3"),
    "friendly": ("friendly", "1.0"),
    "empathetic": ("empathetic", "1.0"),
    "hopeful": ("hopeful", "1.0"),
    "thoughtful": ("friendly", "0.7"),   # no "thoughtful" style — use softer friendly
    "sad": ("sad", "1.0"),
    "surprised": ("excited", "1.0"),      # closest match
}
DEFAULT_STYLE = ("friendly", "1.0")

# Regex to extract [mood:X] from start of text
MOOD_RE = re.compile(r"^\[mood:(\w+)\]\s*", re.IGNORECASE)


def extract_mood(text: str) -> tuple:
    """Extract mood tag from text. Returns (clean_text, style, styledegree)."""
    m = MOOD_RE.match(text)
    if m:
        mood = m.group(1).lower()
        clean = text[m.end():]
        style, degree = MOOD_TO_STYLE.get(mood, DEFAULT_STYLE)
        return clean, style, degree
    return text, DEFAULT_STYLE[0], DEFAULT_STYLE[1]


def text_to_ssml(text: str) -> str:
    """Convert plain text (with optional mood tag) to SSML for Azure Speech Avatar."""
    clean_text, style, degree = extract_mood(text)
    escaped = clean_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        f'<speak version="1.0" '
        f'xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xml:lang="en-US">'
        f'<voice name="{VOICE_NAME}">'
        f'<prosody rate="+10%">'
        f"{escaped}"
        f"</prosody>"
        f"</voice></speak>"
    )


def extract_phrases(buffer: str) -> Tuple[List[str], str]:
    """
    Extract speakable phrases from a text buffer.

    Splits on sentence boundaries (.!?) to give the TTS engine
    longer, more natural utterances without awkward inter-phrase gaps.

    Returns (phrases, remaining_buffer).
    """
    phrases: List[str] = []

    while True:
        stripped = buffer.strip()
        if not stripped:
            break

        # Sentence boundary: .!? followed by whitespace or end of buffer
        m = re.search(r"[.!?](?:\s|$)", buffer)
        if m:
            phrase = buffer[: m.end()].strip()
            buffer = buffer[m.end() :]
            if phrase:
                phrases.append(phrase)
            continue

        # Not a complete sentence yet — keep buffering
        break

    return phrases, buffer
