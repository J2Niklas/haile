# HAILE — AI Avatar Assistant

A real-time AI avatar assistant powered by Azure OpenAI, Azure Speech Services, and Azure Avatar SDK. HAILE speaks through a lifelike WebRTC avatar with low-latency streaming.

## Architecture

```
frontend/       Static site (HTML/JS/CSS) — served via Azure Static Web Apps
backend/        FastAPI server — Azure App Service (Linux, Python 3.11)
infrastructure/ Bicep IaC — Azure OpenAI, Speech, App Service, Static Web App
```

### Two Chat Modes

| Mode | Path | Flow |
|------|------|------|
| **Realtime** (primary) | `WS /api/realtime` | Mic PCM16 → backend WebSocket proxy → Azure OpenAI Realtime API → text phrases → Avatar TTS |
| **SSE** (fallback) | `POST /api/chat` | Mic → Speech SDK STT → SSE stream → GPT phrases → Avatar TTS |

Realtime mode eliminates the separate STT step, cutting ~1–2 s of latency. The backend auto-detects whether a Realtime deployment is available and the frontend falls back to SSE if not.

## Prerequisites

- Python 3.11+
- Azure CLI (`az`)
- An Azure subscription with:
  - Azure OpenAI (gpt-4o-mini and optionally gpt-4o-realtime-preview)
  - Azure Speech Services (with Avatar enabled)
- Node.js (for `npx` / SWA CLI during deploy)

## Local Development

### 1. Configure secrets

Copy the example settings and fill in your Azure resource details:

```powershell
cp backend/local.settings.example.json backend/local.settings.json
# Edit backend/local.settings.json with your endpoints and credentials
```

### 2. Start the backend

```powershell
.\start-backend.ps1
```

This creates a Python virtual environment, installs dependencies, and starts the FastAPI server on `http://localhost:7071`.

### 3. Start the frontend

```powershell
.\start-frontend.ps1
```

Opens `http://localhost:8000` with a simple Python HTTP server.

## Deployment

```powershell
.\deploy.ps1
```

This script:
1. Creates/updates Azure resources via Bicep
2. Deploys the backend to App Service (zip deploy with remote build)
3. Deploys the frontend to Azure Static Web Apps
4. Grants RBAC roles for managed identity access

## Project Structure

```
backend/
  config.py             Settings loader & environment config
  auth.py               PIN-based authentication & rate limiting
  credentials.py        AAD tokens, OpenAI client, Speech token/ICE
  system_prompt.py      System prompt for the AI assistant
  ssml.py               SSML generation & phrase extraction
  main.py               FastAPI app, routes, startup

frontend/
  index.html            Single-page app shell
  config.js             API endpoint & constants
  state.js              Shared mutable state
  dom.js                DOM references & UI helpers
  speech.js             Speech token, Avatar WebRTC, TTS queue
  stt.js                Speech-to-text (STT) recognizer
  realtime.js           Realtime API WebSocket & audio streaming
  chat.js               Message sending & SSE parsing
  auth.js               Auth gate UI
  app.js                Boot sequence & event wiring
  styles.css            Styles

infrastructure/
  main.bicep            Azure resource definitions (Bicep)
```

## Configuration

All backend configuration is via environment variables (loaded from `local.settings.json` in dev):

| Variable | Description |
|----------|-------------|
| `AzureOpenAIEndpoint` | Azure OpenAI endpoint URL |
| `AzureOpenAIChatDeployment` | Chat model deployment name (default: `gpt-4o-mini`) |
| `AzureOpenAIRealtimeEndpoint` | Realtime API endpoint (can be a different resource) |
| `AzureOpenAIRealtimeDeployment` | Realtime model deployment (default: `gpt-4o-realtime-preview`) |
| `AzureSpeechEndpoint` | Azure Speech Services endpoint |
| `AzureSpeechRegion` | Speech region (default: `swedencentral`) |
| `AppPin` | Access PIN (leave empty to disable auth) |
| `CorsOrigins` | Comma-separated allowed origins (default: `*`) |

## Customization

- **Greeting**: Edit `GREETING_TEXT` in `frontend/config.js`
- **System prompt**: Edit `backend/system_prompt.py`
- **Avatar character**: Change avatar name/style in `frontend/speech.js` (`_connectAvatar`)
- **Voice**: Change `VOICE_NAME` in `backend/ssml.py`
