# HAILE — Project Handover

**From:** `<your name / email>`
**To:** `<colleague name / email>`
**Effective date:** `<YYYY-MM-DD>`
**Repo:** https://github.com/J2Niklas/haile
**Baseline tag:** `<handoff-YYYY-MM-DD>` (created on the commit handed over)

> This document captures everything **not** in the source tree: live environments, secrets locations, owners, and operational knowledge. For architecture and dev setup, see [README.md](README.md).

---

## 1. TL;DR — What you're inheriting

HAILE is a real-time AI avatar assistant: FastAPI backend on Azure App Service + static frontend on Azure Static Web Apps, glued to Azure OpenAI (chat + optional Realtime) and Azure Speech (Avatar). Two deploy targets exist today: a **persistent dev environment** in `swedencentral` and a **demo environment** in `southcentralus` (Dallas demo) that's spun up/down on demand.

---

## 2. Contacts & ownership

| Role | Name | Email / Teams | Notes |
|---|---|---|---|
| Outgoing owner | `<you>` | `<email>` | Available for questions until `<date>` |
| Incoming owner | `<colleague>` | `<email>` | Primary maintainer from `<date>` |
| Stakeholder / sponsor | `<name>` | `<email>` | Approves direction & demo schedule |
| Azure subscription owner | `<name>` | `<email>` | Required for RBAC / quota requests |

---

## 3. Azure tenancy & subscriptions

| Item | Value |
|---|---|
| Tenant ID | `<tenant-guid>` |
| Subscription name | `<subscription-name>` |
| Subscription ID | `<subscription-guid>` |
| Billing owner | `<name>` |
| Cost center / tag | `<tag>` |
| Quota notes | Azure OpenAI `gpt-4o-mini` GlobalStandard 30 TPM in `swedencentral`; Speech Avatar feature is **gated** ([apply here](https://aka.ms/csgate)) — approval already granted for this tenant on `<date>` |

**Required role for incoming owner:** `Contributor` on both resource groups (Owner if they need to grant new RBAC).

---

## 4. Target deployments

### 4.1 Primary / dev environment (Sweden)

Deployed via [deploy.ps1](deploy.ps1).

| Item | Value |
|---|---|
| Resource group | `rg-haile` |
| Region | `swedencentral` |
| Environment tag | `dev` |
| App Service plan SKU | `B1` (Linux, Python 3.11) |
| Frontend URL | `https://<swa-haile-dev>.azurestaticapps.net` *(fill from `swa-haile-dev` portal)* |
| Backend URL | `https://app-haile-dev.azurewebsites.net` |
| Realtime mode | `<enabled / disabled>` — pass `realtimeEndpoint=` to enable |
| Access PIN | `<set in secrets store, item "haile-dev-pin", or "" if disabled>` |

**Resources** (all named by Bicep convention `<type>-haile-dev`):

| Resource | Name |
|---|---|
| App Service | `app-haile-dev` |
| App Service Plan | `asp-haile-dev` |
| Static Web App | `swa-haile-dev` |
| Azure OpenAI | `openai-haile-dev` (deployment: `gpt-4o-mini` GlobalStandard, capacity 30) |
| Azure Speech | `speech-haile-dev` |
| Storage | `sthailedev` |
| App Insights | `appi-haile-dev` |

**Identity / auth model:** App Service uses **system-assigned managed identity** with these RBAC roles (assigned in Bicep):

- `Cognitive Services OpenAI User` on `openai-haile-dev`
- `Cognitive Services User` on `speech-haile-dev`
- `Storage Blob Data Owner` on `sthailedev`

No keys are stored in app settings — the backend obtains AAD tokens at runtime ([backend/credentials.py](backend/credentials.py)).

### 4.2 Demo environment (Dallas)

Ephemeral; deployed via [deploy-dallas.ps1](deploy-dallas.ps1) and torn down via [teardown-dallas.ps1](teardown-dallas.ps1).

| Item | Value |
|---|---|
| Resource group | `rg-haile-dallas` |
| Region | `southcentralus` (San Antonio — closest Azure region to Dallas) |
| SWA region | `centralus` |
| Environment tag | `dallas` |
| App Service plan SKU | `B1` |
| Lifecycle | Spun up before each demo, torn down after — **delete when not in active use** to control cost |

Resource names follow `<type>-haile-dallas` / `sthailedallas`.

### 4.3 Realtime OpenAI resource (optional, separate)

`gpt-4o-realtime-preview` is **not** deployed by [infrastructure/main.bicep](infrastructure/main.bicep) because of regional model availability. If a separate resource exists, record it here:

| Item | Value |
|---|---|
| Resource | `<openai-haile-realtime>` or `n/a` |
| Region | `<eastus2 / swedencentral / …>` |
| Endpoint | `https://<…>.openai.azure.com/` |
| Deployment name | `gpt-4o-realtime-preview` |

When this is empty, the frontend automatically falls back to SSE mode.

---

## 5. Secrets & configuration

**Nothing sensitive lives in git.** [backend/local.settings.json](backend/local.settings.json) is gitignored; the template is [backend/local.settings.example.json](backend/local.settings.example.json).

### 5.1 Where to find secrets

| Secret | Location | Notes |
|---|---|---|
| App access PIN (`AppPin`) | `<Key Vault kv-haile / 1Password vault / …>`, item `haile-app-pin` | Deployed only if you pass `appPin=` to Bicep |
| SWA deployment token | Portal → `swa-haile-dev` → **Manage deployment token** | Also retrievable: `az staticwebapp secrets list -n swa-haile-dev -g rg-haile --query properties.apiKey -o tsv` |
| Azure CLI publish credentials (App Service) | Portal → `app-haile-dev` → **Deployment Center** | Only needed for manual zip-deploy outside the script |
| OpenAI / Speech keys | **Not used.** Managed identity + AAD only. | Local dev relies on `az login` → `DefaultAzureCredential` |

### 5.2 Local dev configuration

Copy [backend/local.settings.example.json](backend/local.settings.example.json) to `backend/local.settings.json` and fill in. Values to populate from the dev environment:

```
AzureOpenAIEndpoint            = https://openai-haile-dev.openai.azure.com/
AzureOpenAIChatDeployment      = gpt-4o-mini
AzureOpenAIRealtimeEndpoint    = <realtime endpoint or "">
AzureOpenAIRealtimeDeployment  = gpt-4o-realtime-preview
AzureSpeechEndpoint            = https://speech-haile-dev.cognitiveservices.azure.com/
AzureSpeechRegion              = swedencentral
AppPin                         = ""    # leave empty for local dev
CorsOrigins                    = *
```

The dev environment grants your user account the same RBAC roles as the App Service MI, so `az login` is sufficient — no keys.

### 5.3 Authoritative app settings (deployed)

Source of truth is [infrastructure/main.bicep](infrastructure/main.bicep) → `webApp.siteConfig.appSettings`. To inspect what's actually live:

```powershell
az webapp config appsettings list -g rg-haile -n app-haile-dev -o table
```

---

## 6. Repository handover steps

1. **Tag the baseline** before transfer:
   ```powershell
   git tag handoff-2026-05-06 -m "Handover baseline to <colleague>"
   git push origin handoff-2026-05-06
   ```
2. **Choose access model** (one):
   - **Collaborator add** — GitHub → repo Settings → Collaborators & teams → invite, role = Maintain.
   - **Transfer ownership** — Settings → Danger Zone → Transfer; old URL redirects automatically.
   - **Move to org** — transfer to a shared org if the project should outlive individuals.
3. **Update [README.md](README.md)** maintainer line and any contact info to point to the new owner.
4. **Reassign open issues / PRs / projects** to the colleague in GitHub.

---

## 7. Operational runbook

### 7.1 Deploy / redeploy

```powershell
# Sweden (primary)
.\deploy.ps1

# Dallas demo
.\deploy-dallas.ps1

# Tear down Dallas after demo
.\teardown-dallas.ps1
```

To enable Realtime mode, edit the `az deployment group create` line in [deploy.ps1](deploy.ps1) and append:

```
--parameters realtimeEndpoint='https://<your-openai>.openai.azure.com/'
```

To set/rotate the access PIN, append `appPin='<new-pin>'` and re-deploy.

### 7.2 Logs & diagnostics

| Source | How |
|---|---|
| Backend stdout / FastAPI logs | `az webapp log tail -g rg-haile -n app-haile-dev` |
| App Insights (traces, exceptions, dependencies) | Portal → `appi-haile-dev` → Logs (KQL) |
| Frontend (browser) | DevTools console — look for `Realtime not available` to confirm SSE fallback |
| Speech avatar WebRTC | Browser DevTools → Network → WS / `chrome://webrtc-internals` |

### 7.3 Common operational tasks

| Task | Command / location |
|---|---|
| Restart backend | `az webapp restart -g rg-haile -n app-haile-dev` |
| Roll back to previous deploy | App Service → Deployment Center → Logs → "Redeploy" prior commit, **or** `git checkout <prev-tag>` then `.\deploy.ps1` |
| Rotate SWA token | Portal → `swa-haile-dev` → Manage deployment token → Reset |
| Add a CORS origin | Edit `cors.allowedOrigins` in [infrastructure/main.bicep](infrastructure/main.bicep) and redeploy |
| Change voice / avatar | `VOICE_NAME` in [backend/ssml.py](backend/ssml.py); avatar in `_connectAvatar` of [frontend/speech.js](frontend/speech.js) |
| Update system prompt | [backend/system_prompt.py](backend/system_prompt.py) |

### 7.4 Troubleshooting cheatsheet

| Symptom | Likely cause | Action |
|---|---|---|
| Avatar never appears | Speech Avatar feature not approved | [aka.ms/csgate](https://aka.ms/csgate) |
| 401 on `/api/*` | `AppPin` is set but client didn't enter it | Enter PIN, or redeploy with empty `appPin` |
| 403 from OpenAI in App Insights | RBAC propagation delay (minutes after first deploy) | Wait 5–10 min; verify role assignment exists |
| WebSocket immediately closes | `webSocketsEnabled` flipped off, or App Service plan too small | Confirm `webSocketsEnabled: true`; bump plan to S1 if heavy load |
| `Realtime not available` in logs | No Realtime endpoint configured | Provide `realtimeEndpoint` parameter, or accept SSE fallback |
| CORS errors | Frontend origin not in allow-list | Add to `cors.allowedOrigins` in Bicep + redeploy |

---

## 8. Cost & budget

| Resource | Approx. monthly idle cost (USD) | Notes |
|---|---|---|
| App Service Plan B1 | ~$13 | Always-on backend |
| Static Web App Free | $0 | |
| Azure OpenAI `gpt-4o-mini` (GlobalStandard) | Pay-per-token | 30 TPM cap; usage-driven |
| Azure Speech S0 (Avatar) | Pay-per-second of avatar streaming | Significant during demos — track in Cost Management |
| App Insights | <$1 idle | 30-day retention |
| Storage Standard_LRS | <$1 | Minimal |

**Recommended:** set a budget alert on the subscription (e.g. $50/month for `rg-haile`, $100 for `rg-haile-dallas` during demo windows).

---

## 9. Known issues, in-flight work & TODOs

> Update this section before handover with current state.

- [ ] `<e.g., gpt-4o-mini quota raise pending — request id …>`
- [ ] `<in-flight feature branch / PR>`
- [ ] `<known UX glitch in frontend/realtime.js when network drops>`
- [ ] `<TODO: add CI workflow on push to main>`
- [ ] `<TODO: add main branch protection>`

---

## 10. Architecture decisions worth knowing

These are intentional choices that aren't always obvious from code:

1. **Two chat modes (Realtime + SSE)** — Realtime is preferred for latency, but it's optional because `gpt-4o-realtime-preview` isn't available in every region. Auto-detection in the backend ([backend/main.py](backend/main.py)); fallback in [frontend/realtime.js](frontend/realtime.js).
2. **Managed Identity, no keys** — `disableLocalAuth: true` on the OpenAI account. RBAC is granted in Bicep; rolling a key is impossible because there is none.
3. **`gpt-4o-mini` on GlobalStandard** — chosen for lowest-latency routing at the cost of regional pinning. Switch to `Standard` if data-residency becomes a hard requirement.
4. **System prompt and SSML voice live in code, not config** — intentional, so prompt/voice changes are tracked in git history. See [backend/system_prompt.py](backend/system_prompt.py), [backend/ssml.py](backend/ssml.py).
5. **Frontend `config.js` rewritten at deploy time** — the deploy script string-replaces `http://localhost:7071/api` with the App Service URL, so [frontend/config.js](frontend/config.js) always commits the local-dev value.
6. **PIN auth is intentionally simple** — single shared PIN with rate limiting in [backend/auth.py](backend/auth.py). Replace with Entra ID if multi-user / audited access is required.

---

## 11. Verification checklist (do before sign-off)

- [ ] Colleague has Contributor on `rg-haile` and `rg-haile-dallas`
- [ ] Colleague is GitHub collaborator (or repo transferred)
- [ ] Colleague has access to the secrets store (Key Vault / 1Password vault)
- [ ] `git grep -iE "(api[_-]?key|secret|password|pin)\s*[:=]"` returns no real values
- [ ] Colleague performs a fresh `git clone` + `.\deploy.ps1` to a *throwaway* RG end-to-end
- [ ] Colleague runs [start-backend.ps1](start-backend.ps1) + [start-frontend.ps1](start-frontend.ps1) locally and chats with the avatar
- [ ] Colleague successfully tears down a Dallas deploy via [teardown-dallas.ps1](teardown-dallas.ps1)
- [ ] Maintainer info / contacts updated in [README.md](README.md)
- [ ] Issues/PRs reassigned in GitHub

---

## 12. Where to read next

- [README.md](README.md) — architecture, dev setup, customization
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding guidelines
- [infrastructure/main.bicep](infrastructure/main.bicep) — single source of truth for Azure resources
