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

- **Windows** with PowerShell 5.1+ (scripts are `.ps1`)
- **Python 3.11+** — [python.org](https://www.python.org/downloads/)
- **Azure CLI** (`az`) — [Install](https://learn.microsoft.com/cli/azure/install-azure-cli)
- **Node.js 18+** — needed for `npx` / SWA CLI during deploy — [nodejs.org](https://nodejs.org/)
- An **Azure subscription** with the following services available in your chosen region:
  - Azure OpenAI (with access to deploy `gpt-4o-mini`)
  - Azure Speech Services (**with Avatar feature enabled** — currently requires [applying for access](https://aka.ms/csgate))
  - *(Optional)* A separate Azure OpenAI resource with `gpt-4o-realtime-preview` for low-latency Realtime mode

## Quick Start (Deploy to Azure)

> **Total time:** ~10–15 minutes for a first-time deploy.

### 1. Clone the repo

```powershell
git clone https://github.com/J2Niklas/haile.git
cd haile
```

### 2. Log in to Azure

```powershell
az login
az account set --subscription "<your-subscription-id>"
```

### 3. Deploy everything

```powershell
.\deploy.ps1
```

This single script will:
1. Create a resource group `rg-haile` in `swedencentral`
2. Deploy all Azure resources via Bicep (OpenAI, Speech, App Service, Static Web App, Storage, App Insights)
3. Package and zip-deploy the backend to App Service
4. Deploy the frontend to Azure Static Web Apps

At the end it prints the frontend URL — open it in a browser.

> **To change region or resource group**, edit the `$RESOURCE_GROUP` and `$LOCATION` variables at the top of `deploy.ps1`.

> **To set an access PIN**, pass it as a Bicep parameter:
> ```powershell
> # In deploy.ps1, change the az deployment line to:
> az deployment group create `
>     --resource-group $RESOURCE_GROUP `
>     --template-file infrastructure/main.bicep `
>     --parameters environment=$ENVIRONMENT appPin='your-secret-pin' `
>     --output none
> ```

> **To enable Realtime mode**, pass the endpoint of an Azure OpenAI resource that has `gpt-4o-realtime-preview` deployed:
> ```powershell
> --parameters environment=$ENVIRONMENT realtimeEndpoint='https://your-openai.openai.azure.com/'
> ```

## Local Development

### 1. Configure secrets

Copy the example settings and fill in your Azure resource details:

```powershell
cp backend/local.settings.example.json backend/local.settings.json
# Edit backend/local.settings.json with your endpoints and credentials
```

You'll need values from your deployed Azure resources:
- `AzureOpenAIEndpoint` — find in Azure Portal → your OpenAI resource → Keys and Endpoint
- `AzureSpeechEndpoint` — find in Azure Portal → your Speech resource → Keys and Endpoint
- `AzureSpeechRegion` — the region of your Speech resource (e.g. `swedencentral`)

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
4. Assigns RBAC roles for managed identity access (no keys stored in config)

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Avatar doesn't appear | Speech Avatar feature not enabled | [Apply for access](https://aka.ms/csgate) and wait for approval |
| "Realtime not available" in console | No `gpt-4o-realtime-preview` deployment | App auto-falls back to SSE mode. To enable, pass `realtimeEndpoint` parameter |
| CORS errors in browser | Frontend origin not in allowed list | Check the `cors.allowedOrigins` in `main.bicep` or set `CorsOrigins` env var |
| 401 on API calls | PIN auth enabled but not entered | Enter the PIN in the login screen, or remove `AppPin` to disable auth |

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
