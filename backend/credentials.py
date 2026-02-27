"""
HAILE Backend — Azure Credentials & Clients

AAD token management, OpenAI async client, Speech token + ICE relay caching.
"""

import time
import logging
from typing import Dict, Optional

import requests as http_requests
from azure.identity import DefaultAzureCredential
from openai import AsyncAzureOpenAI

from config import (
    AOAI_ENDPOINT,
    AOAI_API_VERSION,
    SPEECH_ENDPOINT,
    SPEECH_REGION,
)

# ── AAD credential ────────────────────────────────────────────

_credential = DefaultAzureCredential()
_cached_token: Optional[str] = None
_cached_token_expires: float = 0


def get_aad_token() -> str:
    """Return a cached AAD token for Cognitive Services, refreshing when needed."""
    global _cached_token, _cached_token_expires
    now = time.time()
    if _cached_token and now < _cached_token_expires - 300:
        return _cached_token
    token_obj = _credential.get_token("https://cognitiveservices.azure.com/.default")
    _cached_token = token_obj.token
    _cached_token_expires = token_obj.expires_on
    logging.info("AAD token refreshed")
    return _cached_token


# ── Azure OpenAI client ───────────────────────────────────────

_aoai_client: Optional[AsyncAzureOpenAI] = None


def get_aoai_client() -> AsyncAzureOpenAI:
    global _aoai_client
    if _aoai_client is None:
        _aoai_client = AsyncAzureOpenAI(
            azure_endpoint=AOAI_ENDPOINT,
            azure_ad_token_provider=get_aad_token,
            api_version=AOAI_API_VERSION,
        )
    return _aoai_client


# ── Speech token + ICE relay ──────────────────────────────────

_speech_cache: Optional[Dict] = None
_speech_cache_expires: float = 0
_SPEECH_CACHE_TTL = 540  # 9 min (tokens valid 10 min)


def get_cached_speech_result() -> Optional[Dict]:
    if _speech_cache and time.time() < _speech_cache_expires:
        return _speech_cache
    return None


def fetch_speech_token_and_ice() -> Dict:
    """Fetch Speech STS token + ICE relay credentials for avatar WebRTC."""
    global _speech_cache, _speech_cache_expires

    aad_token_str = get_aad_token()

    # Exchange AAD token for Speech token
    token_url = f"{SPEECH_ENDPOINT}sts/v1.0/issueToken"
    resp = http_requests.post(token_url, headers={
        "Authorization": f"Bearer {aad_token_str}",
        "Content-Length": "0",
    })
    resp.raise_for_status()
    speech_jwt = resp.text
    result: Dict = {"token": speech_jwt, "region": SPEECH_REGION}

    # Fetch ICE relay credentials for Avatar WebRTC
    try:
        ice_url = f"{SPEECH_ENDPOINT}tts/cognitiveservices/avatar/relay/token/v1"
        ice_resp = http_requests.get(ice_url, headers={"Authorization": f"Bearer {speech_jwt}"})
        if ice_resp.status_code == 200:
            result["iceServers"] = ice_resp.json()
            logging.info("Avatar ICE relay credentials acquired")
        else:
            logging.warning(f"ICE relay returned {ice_resp.status_code}, trying regional fallback")
            ice_url2 = f"https://{SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1"
            ice_resp2 = http_requests.get(ice_url2, headers={"Authorization": f"Bearer {speech_jwt}"})
            if ice_resp2.status_code == 200:
                result["iceServers"] = ice_resp2.json()
                logging.info("Avatar ICE relay credentials acquired (regional)")
            else:
                logging.warning(f"ICE relay regional returned {ice_resp2.status_code}")
                result["iceServers"] = None
    except Exception as ice_err:
        logging.warning(f"ICE relay fetch failed: {ice_err}")
        result["iceServers"] = None

    _speech_cache = result
    _speech_cache_expires = time.time() + _SPEECH_CACHE_TTL
    logging.info("Speech token + ICE cached (9 min TTL)")
    return result
