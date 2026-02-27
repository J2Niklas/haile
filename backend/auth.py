"""
HAILE Backend — PIN Authentication

Simple PIN-based auth with bearer tokens and rate limiting.
"""

import time
import hmac
import secrets
from typing import Dict, Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from config import APP_PIN, AUTH_TOKEN_TTL

_auth_tokens: Dict[str, float] = {}   # token → expiry timestamp
_login_attempts: Dict[str, list] = {}  # ip → [timestamps]
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 60


def _generate_auth_token() -> str:
    return secrets.token_urlsafe(32)


def is_rate_limited(client_ip: str) -> bool:
    now = time.time()
    attempts = _login_attempts.get(client_ip, [])
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW_SECONDS]
    _login_attempts[client_ip] = attempts
    return len(attempts) >= MAX_LOGIN_ATTEMPTS


def record_login_attempt(client_ip: str):
    if client_ip not in _login_attempts:
        _login_attempts[client_ip] = []
    _login_attempts[client_ip].append(time.time())


def _cleanup_expired_tokens():
    now = time.time()
    expired = [t for t, exp in _auth_tokens.items() if now > exp]
    for t in expired:
        del _auth_tokens[t]


def validate_auth(request: Request) -> Optional[JSONResponse]:
    """Returns a 401 JSONResponse if auth fails, or None if OK."""
    if not APP_PIN:
        return None
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    token = auth_header[7:]
    _cleanup_expired_tokens()
    if token not in _auth_tokens:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return None


def create_token() -> str:
    """Generate and store a new auth token."""
    token = _generate_auth_token()
    _auth_tokens[token] = time.time() + AUTH_TOKEN_TTL
    return token


def verify_pin(pin: str) -> bool:
    """Constant-time PIN comparison."""
    return hmac.compare_digest(pin, APP_PIN)
