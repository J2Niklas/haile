"""
HAILE Backend — Configuration

Loads settings from local.settings.json (dev) or environment variables (production).
"""

import os
import json
import logging


def _load_local_settings():
    """Load environment variables from local.settings.json (Azure Functions compat format)."""
    settings_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local.settings.json")
    if os.path.exists(settings_path):
        with open(settings_path) as f:
            settings = json.load(f)
        for key, value in settings.get("Values", {}).items():
            if key not in os.environ:
                os.environ[key] = str(value)
        logging.info(f"Loaded {len(settings.get('Values', {}))} settings from local.settings.json")


_load_local_settings()

# ── Azure OpenAI ──────────────────────────────────────────────

AOAI_ENDPOINT = os.environ.get("AzureOpenAIEndpoint", "")
AOAI_REALTIME_ENDPOINT = os.environ.get("AzureOpenAIRealtimeEndpoint", "") or AOAI_ENDPOINT
AOAI_CHAT_DEPLOYMENT = os.environ.get("AzureOpenAIChatDeployment", "gpt-4o-mini")
AOAI_REALTIME_DEPLOYMENT = os.environ.get("AzureOpenAIRealtimeDeployment", "gpt-4o-realtime-preview")
AOAI_API_VERSION = os.environ.get("AzureOpenAIApiVersion", "2024-12-01-preview")

# ── Azure Speech ──────────────────────────────────────────────

SPEECH_REGION = os.environ.get("AzureSpeechRegion", "swedencentral")
SPEECH_ENDPOINT = os.environ.get("AzureSpeechEndpoint", "")

# ── Auth ──────────────────────────────────────────────────────

APP_PIN = os.environ.get("AppPin", "")
AUTH_TOKEN_TTL = int(os.environ.get("AuthTokenTTLHours", "24")) * 3600

# ── CORS ──────────────────────────────────────────────────────

CORS_ORIGINS = [o.strip() for o in os.environ.get("CorsOrigins", "*").split(",")]
