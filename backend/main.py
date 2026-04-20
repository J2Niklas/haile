"""
HAILE — AI Avatar Backend

FastAPI server with two chat paths:
  1. SSE streaming:  POST /api/chat  — GPT stream → phrase detection → SSE events
  2. Realtime proxy: WS /api/realtime — mic audio → Azure OpenAI Realtime API → text phrases

Both paths emit phrases for the frontend to queue as avatar TTS SSML.
"""

import json
import logging
import asyncio
import base64

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

from config import (
    CORS_ORIGINS,
    AOAI_CHAT_DEPLOYMENT,
    AOAI_REALTIME_ENDPOINT,
    AOAI_REALTIME_DEPLOYMENT,
    SPEECH_ENDPOINT,
    APP_PIN,
)
from auth import validate_auth, create_token, verify_pin, is_rate_limited, record_login_attempt
from credentials import get_aad_token, get_aoai_client, fetch_speech_token_and_ice, get_cached_speech_result
from system_prompt import SYSTEM_PROMPT
from ssml import text_to_ssml, extract_phrases, MOOD_RE, strip_product_tags, extract_product_ids, inject_language_instruction

# Optional: websockets for Realtime API proxy
try:
    import websockets as ws_client

    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
    logging.warning("websockets not installed — Realtime API proxy disabled. pip install websockets")


# ── App ───────────────────────────────────────────────────────

app = FastAPI(title="HAILE Avatar Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup — pre-warm connections (F) ────────────────────────

@app.on_event("startup")
async def startup_prewarm():
    """Pre-warm connections on startup to eliminate cold-start latency."""
    try:
        get_aad_token()
        logging.info("Startup: AAD token pre-warmed")
    except Exception as e:
        logging.warning(f"Startup: AAD token pre-warm failed: {e}")

    try:
        client = get_aoai_client()
        await client.chat.completions.create(
            model=AOAI_CHAT_DEPLOYMENT,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
            stream=False,
        )
        logging.info("Startup: OpenAI connection pool pre-warmed")
    except Exception as e:
        logging.warning(f"Startup: OpenAI pre-warm failed: {e}")

    try:
        if SPEECH_ENDPOINT:
            fetch_speech_token_and_ice()
            logging.info("Startup: Speech token pre-warmed")
    except Exception as e:
        logging.warning(f"Startup: Speech token pre-warm failed: {e}")


# ── Routes ────────────────────────────────────────────────────

@app.post("/api/login")
async def login(request: Request):
    """Authenticate with PIN and receive a bearer token."""
    if not APP_PIN:
        return JSONResponse({"token": create_token()})

    client_ip = request.headers.get(
        "X-Forwarded-For", request.client.host if request.client else "unknown"
    ).split(",")[0].strip()

    if is_rate_limited(client_ip):
        return JSONResponse({"error": "Too many attempts. Try again later."}, status_code=429)

    try:
        body = await request.json()
        pin = body.get("pin", "")
    except Exception:
        pin = ""

    if verify_pin(pin):
        return JSONResponse({"token": create_token()})
    else:
        record_login_attempt(client_ip)
        return JSONResponse({"error": "Invalid access code"}, status_code=401)


@app.get("/api/speech_token")
async def speech_token(request: Request):
    """Get Azure Speech token + ICE relay credentials for avatar rendering."""
    auth_err = validate_auth(request)
    if auth_err:
        return auth_err

    if not SPEECH_ENDPOINT:
        return JSONResponse({"error": "Azure Speech not configured"}, status_code=503)

    try:
        cached = get_cached_speech_result()
        if cached:
            return JSONResponse(cached)
        return JSONResponse(fetch_speech_token_and_ice())
    except Exception as e:
        logging.error(f"Speech token error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/chat")
async def chat_stream(request: Request):
    """
    Streaming chat via SSE with phrase-level splitting (B).

    SSE events:
      event: sentence  → {"sentence": "...", "ssml": "<speak>..."}
      event: done      → {"fullReply": "..."}
    """
    auth_err = validate_auth(request)
    if auth_err:
        return auth_err

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    chat_messages = body.get("messages", [])
    if not chat_messages:
        return JSONResponse({"error": "messages array is required"}, status_code=400)

    language = body.get("language", "en-US")

    gpt_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in chat_messages[-16:]:
        gpt_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })
    inject_language_instruction(gpt_messages, language)

    client = get_aoai_client()

    async def generate():
        buffer = ""
        full_reply = ""

        try:
            stream = await client.chat.completions.create(
                model=AOAI_CHAT_DEPLOYMENT,
                messages=gpt_messages,  # type: ignore[arg-type]
                max_tokens=400,
                temperature=0.9,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    buffer += token
                    full_reply += token

                    phrases, buffer = extract_phrases(buffer)
                    for phrase in phrases:
                        ssml = text_to_ssml(phrase, language=language)
                        display = strip_product_tags(MOOD_RE.sub("", phrase))
                        evt = {'sentence': display, 'ssml': ssml, **extract_product_ids(phrase)}
                        yield f"event: sentence\ndata: {json.dumps(evt)}\n\n"

            # Flush remaining buffer
            if buffer.strip():
                remainder = buffer.strip()
                ssml = text_to_ssml(remainder, language=language)
                display = strip_product_tags(MOOD_RE.sub("", remainder))
                evt = {'sentence': display, 'ssml': ssml, **extract_product_ids(remainder)}
                yield f"event: sentence\ndata: {json.dumps(evt)}\n\n"

            clean_reply = strip_product_tags(MOOD_RE.sub("", full_reply.strip()))
            yield f"event: done\ndata: {json.dumps({'fullReply': clean_reply})}\n\n"

        except Exception as e:
            logging.error(f"Streaming chat error: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ── Realtime API WebSocket Proxy (E) ─────────────────────────

@app.websocket("/api/realtime")
async def realtime_proxy(websocket: WebSocket):
    """WebSocket proxy to Azure OpenAI Realtime API."""
    if not HAS_WEBSOCKETS:
        await websocket.close(code=4001, reason="websockets package not installed")
        return

    await websocket.accept()
    logging.info("Realtime WS: client connected")

    host = AOAI_REALTIME_ENDPOINT.replace("https://", "").replace("http://", "").rstrip("/")
    azure_ws_url = (
        f"wss://{host}/openai/realtime"
        f"?api-version=2024-10-01-preview"
        f"&deployment={AOAI_REALTIME_DEPLOYMENT}"
    )

    aad_token = get_aad_token()

    try:
        async with ws_client.connect(
            azure_ws_url,
            additional_headers={"Authorization": f"Bearer {aad_token}"},
            max_size=None,
        ) as azure_ws:
            logging.info("Realtime WS: connected to Azure OpenAI")

            # Configure session: audio input, TEXT-ONLY output (avatar does its own TTS)
            await azure_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "instructions": SYSTEM_PROMPT,
                    "voice": "alloy",
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 200,
                        "silence_duration_ms": 500,
                    },
                    "input_audio_format": "pcm16",
                    "input_audio_transcription": {"model": "whisper-1"},
                    "temperature": 0.9,
                    "max_response_output_tokens": 400,
                },
            }))

            phrase_buffer = ""
            session_language = "en-US"
            vad_disabled = False
            session_updated_event = asyncio.Event()

            VAD_CONFIG = {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 200,
                "silence_duration_ms": 500,
            }

            async def _update_session_language(lang: str):
                """Re-send session.update with language-aware instructions."""
                nonlocal session_language
                session_language = lang
                from ssml import LANGUAGE_NAMES
                instructions = SYSTEM_PROMPT
                if lang != "en-US" and lang in LANGUAGE_NAMES:
                    lang_name = LANGUAGE_NAMES[lang]
                    instructions += (
                        f"\n\nLANGUAGE REQUIREMENT:\n"
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
                await azure_ws.send(json.dumps({
                    "type": "session.update",
                    "session": {"instructions": instructions},
                }))
                logging.info(f"Realtime: session language set to {lang}")

            async def client_to_azure():
                """Forward audio/text from browser to Azure Realtime API."""
                try:
                    while True:
                        data = await websocket.receive()

                        if "bytes" in data and data["bytes"]:
                            audio_b64 = base64.b64encode(data["bytes"]).decode("ascii")
                            await azure_ws.send(json.dumps({
                                "type": "input_audio_buffer.append",
                                "audio": audio_b64,
                            }))

                        elif "text" in data and data["text"]:
                            msg = json.loads(data["text"])
                            if msg.get("type") == "set_language":
                                await _update_session_language(msg.get("language", "en-US"))

                            elif msg.get("type") == "text_input":
                                nonlocal vad_disabled
                                if msg.get("language"):
                                    await _update_session_language(msg["language"])
                                # Disable server VAD and WAIT for Azure to confirm
                                # before sending the text input. Without this wait,
                                # stale audio in Azure's VAD pipeline triggers a
                                # speech_started → response cancellation race.
                                session_updated_event.clear()
                                await azure_ws.send(json.dumps({
                                    "type": "session.update",
                                    "session": {"turn_detection": None},
                                }))
                                vad_disabled = True
                                await azure_ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
                                try:
                                    await asyncio.wait_for(session_updated_event.wait(), timeout=2.0)
                                except asyncio.TimeoutError:
                                    logging.warning("Timeout waiting for session.updated — proceeding anyway")
                                await azure_ws.send(json.dumps({
                                    "type": "conversation.item.create",
                                    "item": {
                                        "type": "message",
                                        "role": "user",
                                        "content": [{"type": "input_text", "text": msg["text"]}],
                                    },
                                }))
                                await azure_ws.send(json.dumps({"type": "response.create"}))

                            elif msg.get("type") == "cancel_response":
                                await azure_ws.send(json.dumps({"type": "response.cancel"}))

                except WebSocketDisconnect:
                    logging.info("Realtime WS: client disconnected")
                except Exception as e:
                    logging.error(f"Realtime client→azure error: {e}")

            async def azure_to_client():
                """Process Azure Realtime events → detect phrases → forward to browser."""
                nonlocal phrase_buffer, vad_disabled

                async def _reenable_vad():
                    nonlocal vad_disabled
                    if vad_disabled:
                        vad_disabled = False
                        await azure_ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
                        await azure_ws.send(json.dumps({
                            "type": "session.update",
                            "session": {"turn_detection": VAD_CONFIG},
                        }))

                try:
                    async for raw in azure_ws:
                        event = json.loads(raw)
                        etype = event.get("type", "")

                        if etype == "response.text.delta":
                            delta = event.get("delta", "")
                            phrase_buffer += delta
                            phrases, phrase_buffer = extract_phrases(phrase_buffer)
                            for phrase in phrases:
                                ssml = text_to_ssml(phrase, language=session_language)
                                display = strip_product_tags(MOOD_RE.sub("", phrase))
                                evt = {"type": "phrase", "text": display, "ssml": ssml, **extract_product_ids(phrase)}
                                await websocket.send_json(evt)

                        elif etype == "response.text.done":
                            if phrase_buffer.strip():
                                remainder = phrase_buffer.strip()
                                ssml = text_to_ssml(remainder, language=session_language)
                                display = strip_product_tags(MOOD_RE.sub("", remainder))
                                evt = {"type": "phrase", "text": display, "ssml": ssml, **extract_product_ids(remainder)}
                                await websocket.send_json(evt)
                            full_text = event.get("text", phrase_buffer.strip())
                            clean_full = strip_product_tags(MOOD_RE.sub("", full_text))
                            await websocket.send_json({"type": "done", "fullReply": clean_full})
                            phrase_buffer = ""
                            await _reenable_vad()

                        elif etype == "response.cancelled":
                            if vad_disabled:
                                # Stale cancellation from audio detected before VAD
                                # was disabled — ignore and keep the response going.
                                logging.info("Realtime: ignoring stale response.cancelled (VAD disabled)")
                            else:
                                phrase_buffer = ""
                                await _reenable_vad()
                                logging.info("Realtime: response cancelled (barge-in)")

                        elif etype == "input_audio_buffer.speech_started":
                            if vad_disabled:
                                # Stale speech detection from audio buffered before
                                # VAD was disabled — ignore completely.
                                logging.info("Realtime: ignoring stale speech_started (VAD disabled)")
                            else:
                                phrase_buffer = ""
                                await websocket.send_json({"type": "speech_started"})

                        elif etype == "input_audio_buffer.speech_stopped":
                            await websocket.send_json({"type": "speech_stopped"})

                        elif etype == "conversation.item.input_audio_transcription.completed":
                            transcript = event.get("transcript", "")
                            if transcript.strip():
                                await websocket.send_json({"type": "transcript", "text": transcript.strip()})

                        elif etype == "error":
                            err_info = event.get("error", {})
                            err_msg = (
                                err_info.get("message", str(err_info))
                                if isinstance(err_info, dict)
                                else str(err_info)
                            )
                            await websocket.send_json({"type": "error", "error": err_msg})
                            logging.error(f"Realtime API error: {err_msg}")

                        elif etype == "session.created":
                            logging.info("Realtime session created")
                            await websocket.send_json({"type": "session_ready"})

                        elif etype == "session.updated":
                            session_updated_event.set()
                            logging.info("Realtime session configured")

                except Exception as e:
                    logging.error(f"Realtime azure→client error: {e}")

            # Run both directions concurrently
            done, pending = await asyncio.wait(
                [asyncio.create_task(client_to_azure()), asyncio.create_task(azure_to_client())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except Exception as e:
        logging.error(f"Realtime WS connection error: {e}")
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        logging.info("Realtime WS: closed")


# ── Entry point ───────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7071, log_level="info")
