"""
HAILE Backend — SSML Generation & Phrase Detection

Converts GPT output to SSML for Azure Speech Avatar TTS,
and splits streaming text into speakable phrases.
"""

import re
from typing import List, Tuple

VOICE_NAME = "en-US-EmmaMultilingualNeural"

VOICE_MAP = {
    "en-US": "en-US-EmmaMultilingualNeural",
    "da-DK": "da-DK-ChristelNeural",
    "de-DE": "de-DE-SeraphinaMultilingualNeural",
    "fr-FR": "fr-FR-VivienneMultilingualNeural",
    "es-ES": "es-ES-ElviraNeural",
    "it-IT": "it-IT-ElsaNeural",
    "pt-PT": "pt-PT-RaquelNeural",
    "nl-NL": "nl-NL-ColetteNeural",
    "sv-SE": "sv-SE-SofieNeural",
    "nb-NO": "nb-NO-PernilleNeural",
}

LANGUAGE_NAMES = {
    "en-US": "English", "da-DK": "Danish", "de-DE": "German",
    "fr-FR": "French", "es-ES": "Spanish", "it-IT": "Italian",
    "pt-PT": "Portuguese", "nl-NL": "Dutch", "sv-SE": "Swedish",
    "nb-NO": "Norwegian",
}

# Voices that support mstts:express-as emotion styles
EMOTION_SUPPORTED_VOICES = {
    "en-US-EmmaMultilingualNeural",
}

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

# Regex to extract [mood:X] from start of text (allows optional space after colon)
MOOD_RE = re.compile(r"^\[mood:\s*(\w+)\]\s*", re.IGNORECASE)

# Regex for [product:ID] and [compare:ID1,ID2,...] tags
PRODUCT_TAG_RE = re.compile(r"\[product:(\w+)\]", re.IGNORECASE)
COMPARE_TAG_RE = re.compile(r"\[compare:([\w,]+)\]", re.IGNORECASE)

# Regex for [lang:xx-XX] translation override tag
LANG_RE = re.compile(r"\[lang:\s*([a-zA-Z]{2}(?:-[a-zA-Z]{2})?)\]\s*", re.IGNORECASE)


def strip_product_tags(text: str) -> str:
    """Remove [product:ID], [compare:...], and [lang:...] tags from text."""
    text = PRODUCT_TAG_RE.sub("", text)
    text = COMPARE_TAG_RE.sub("", text)
    text = LANG_RE.sub("", text)
    return text.strip()


def extract_product_ids(text: str) -> dict:
    """Extract product_id and compare_ids from text. Returns dict with keys."""
    result = {}
    pm = PRODUCT_TAG_RE.search(text)
    if pm:
        result["productId"] = pm.group(1).lower()
    cm = COMPARE_TAG_RE.search(text)
    if cm:
        result["compareIds"] = [s.strip() for s in cm.group(1).lower().split(",") if s.strip()]
    return result


def extract_mood(text: str) -> tuple:
    """Extract mood tag from text. Returns (clean_text, style, styledegree)."""
    m = MOOD_RE.match(text)
    if m:
        mood = m.group(1).lower()
        clean = text[m.end():]
        style, degree = MOOD_TO_STYLE.get(mood, DEFAULT_STYLE)
        return clean, style, degree
    return text, DEFAULT_STYLE[0], DEFAULT_STYLE[1]


def _apply_phoneme_overrides(text: str) -> str:
    """Replace brand names with SSML phoneme tags for correct pronunciation."""
    # HAILE → "Hayley" (IPA: ˈheɪli)
    return re.sub(
        r"HAIL[ÉE]",
        '<phoneme alphabet="ipa" ph="ˈheɪli">HAILE</phoneme>',
        text,
        flags=re.IGNORECASE,
    )


def _extract_lang_override(text: str) -> tuple:
    """Extract [lang:xx-XX] tag from text. Returns (clean_text, lang_code_or_None)."""
    m = LANG_RE.search(text)
    if m:
        raw = m.group(1)
        # Normalise: "es" → "es-ES", "da" → "da-DK", etc.
        LANG_NORMALISE = {
            "en": "en-US", "da": "da-DK", "de": "de-DE", "fr": "fr-FR",
            "es": "es-ES", "it": "it-IT", "pt": "pt-PT", "nl": "nl-NL",
            "sv": "sv-SE", "nb": "nb-NO", "no": "nb-NO",
        }
        code = LANG_NORMALISE.get(raw.lower(), raw) if len(raw) == 2 else raw
        clean = LANG_RE.sub("", text)
        return clean, code
    return text, None


def text_to_ssml(text: str, language: str = "en-US") -> str:
    """Convert plain text (with optional mood/product/lang tags) to SSML for Azure Speech Avatar."""
    clean_text, style, degree = extract_mood(text)
    clean_text, lang_override = _extract_lang_override(clean_text)
    clean_text = strip_product_tags(clean_text)
    escaped = clean_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped = _apply_phoneme_overrides(escaped)
    effective_lang = lang_override or language
    voice = VOICE_MAP.get(effective_lang, VOICE_MAP["en-US"])
    lang = effective_lang if effective_lang in VOICE_MAP else "en-US"

    if voice in EMOTION_SUPPORTED_VOICES:
        return (
            f'<speak version="1.0" '
            f'xmlns="http://www.w3.org/2001/10/synthesis" '
            f'xmlns:mstts="http://www.w3.org/2001/mstts" '
            f'xml:lang="{lang}">'
            f'<voice name="{voice}">'
            f'<mstts:express-as style="{style}" styledegree="{degree}">'
            f'<prosody rate="+20%">'
            f"{escaped}"
            f"</prosody>"
            f"</mstts:express-as>"
            f"</voice></speak>"
        )

    return (
        f'<speak version="1.0" '
        f'xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xml:lang="{lang}">'
        f'<voice name="{voice}">'
        f'<prosody rate="+20%">'
        f"{escaped}"
        f"</prosody>"
        f"</voice></speak>"
    )


def extract_phrases(buffer: str) -> Tuple[List[str], str]:
    """
    Extract speakable phrases from a text buffer.

    Splits on sentence boundaries (.!?) to give the TTS engine
    longer, more natural utterances without awkward inter-phrase gaps.
    Keeps [product:...] and [compare:...] tags attached to the preceding sentence.

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
            end = m.end()
            # Consume any complete [product:...], [compare:...], or [lang:...] tags
            # that immediately follow the sentence boundary.
            rest = buffer[end:]
            while True:
                tag_m = re.match(r"\s*\[(?:product|compare|lang):[^\]]*\]", rest)
                if tag_m:
                    end += tag_m.end()
                    rest = buffer[end:]
                else:
                    break

            # If rest starts with an opening bracket that looks like an
            # incomplete tag (streamed token-by-token), delay extraction
            # so the full tag can arrive with the next delta.
            rest = buffer[end:]
            if re.match(r"\s*\[(?:product|compare|lang)", rest) and "]" not in rest:
                break

            phrase = buffer[:end].strip()
            buffer = buffer[end:]
            if phrase:
                phrases.append(phrase)
            continue

        # Not a complete sentence yet — keep buffering
        break

    return phrases, buffer


def inject_language_instruction(messages: list, language: str) -> None:
    """Append a system message telling GPT to respond in the requested language."""
    if language != "en-US" and language in LANGUAGE_NAMES:
        lang_name = LANGUAGE_NAMES[language]
        messages.append({
            "role": "system",
            "content": (
                f"LANGUAGE REQUIREMENT:\n"
                f"The user has selected {lang_name} as their preferred language. "
                f"You MUST respond ENTIRELY in {lang_name}. "
                f"The user may speak or type in English OR in {lang_name} — "
                f"understand their question regardless of what language they use, "
                f"then answer in {lang_name}. "
                f"All your knowledge from the system prompt above is still fully valid "
                f"— use it to answer questions, just translate your response into {lang_name}. "
                f"You MUST still include [mood:X] at the start of every reply, "
                f"and you MUST still include [product:ID] and [compare:ID1,ID2] tags "
                f"when discussing products — these tags are REQUIRED even when responding in {lang_name}. "
                f"Tags always stay in English exactly as specified: [mood:cheerful], [product:intent], [compare:intent,real]. "
                f"Do NOT translate or omit tags. Everything else the user will hear must be in {lang_name}."
            )
        })
