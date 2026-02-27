# Deployment script for HAILE AI Avatar (PowerShell)
# Bicep infra + zip deploy + SWA deploy

# ==================== CONFIGURATION ====================

$RESOURCE_GROUP = "rg-haile"
$LOCATION = "swedencentral"
$ENVIRONMENT = "dev"

Write-Host "Deploying HAILE AI Avatar" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Resource Group: $RESOURCE_GROUP"
Write-Host "Location: $LOCATION"
Write-Host "Environment: $ENVIRONMENT"
Write-Host ""

# ==================== PREREQUISITES ====================

try { az --version | Out-Null }
catch {
    Write-Host "ERROR: Azure CLI is not installed." -ForegroundColor Red
    exit 1
}

Write-Host "Checking Azure login..." -ForegroundColor Yellow
try { az account show | Out-Null }
catch { az login }

# ==================== INFRASTRUCTURE ====================

Write-Host "Creating resource group..." -ForegroundColor Yellow
az group create --name $RESOURCE_GROUP --location $LOCATION

Write-Host "Deploying Azure infrastructure (Bicep)..." -ForegroundColor Yellow
az deployment group create `
    --resource-group $RESOURCE_GROUP `
    --template-file infrastructure/main.bicep `
    --parameters environment=$ENVIRONMENT `
    --output none

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Infrastructure deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "Infrastructure deployed successfully" -ForegroundColor Green

# Get outputs
$DEPLOYMENT_NAME = "main"

$WEB_APP_NAME = az deployment group show `
    --resource-group $RESOURCE_GROUP `
    --name $DEPLOYMENT_NAME `
    --query 'properties.outputs.webAppName.value' `
    --output tsv

$WEB_APP_URL = az deployment group show `
    --resource-group $RESOURCE_GROUP `
    --name $DEPLOYMENT_NAME `
    --query 'properties.outputs.webAppUrl.value' `
    --output tsv

$SWA_NAME = az deployment group show `
    --resource-group $RESOURCE_GROUP `
    --name $DEPLOYMENT_NAME `
    --query 'properties.outputs.staticWebAppName.value' `
    --output tsv

$SWA_URL = az deployment group show `
    --resource-group $RESOURCE_GROUP `
    --name $DEPLOYMENT_NAME `
    --query 'properties.outputs.staticWebAppUrl.value' `
    --output tsv

Write-Host ""
Write-Host "Web App:        $WEB_APP_NAME" -ForegroundColor Green
Write-Host "Web App URL:    $WEB_APP_URL" -ForegroundColor Green
Write-Host "Static Web App: $SWA_NAME" -ForegroundColor Green
Write-Host "Frontend URL:   $SWA_URL" -ForegroundColor Green
Write-Host ""

# ==================== DEPLOY BACKEND (App Service zip deploy) ====================

Write-Host "Deploying backend to App Service..." -ForegroundColor Yellow
Push-Location backend

# Create zip of backend source
$zipPath = Join-Path $env:TEMP "haile-backend-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Include all Python source + requirements (exclude venv, local settings, __pycache__)
$sourceFiles = @(Get-ChildItem -Filter "*.py" | Select-Object -ExpandProperty Name)
$sourceFiles += "requirements.txt"
Compress-Archive -Path $sourceFiles -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1024)
Write-Host "Created deployment zip: ${zipSize} KB" -ForegroundColor Yellow

# Deploy with remote build (installs pip dependencies on the server)
Write-Host "Uploading via zip deploy - remote build..." -ForegroundColor Yellow
az webapp deployment source config-zip `
    --resource-group $RESOURCE_GROUP `
    --name $WEB_APP_NAME `
    --src $zipPath `
    --timeout 300

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Backend deployment failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Backend deployed. Restarting..." -ForegroundColor Yellow
az webapp restart --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP
Start-Sleep 15

# Cleanup
Remove-Item $zipPath -ErrorAction SilentlyContinue
Pop-Location

# ==================== DEPLOY FRONTEND (Static Web App) ====================

Write-Host "Deploying frontend to Static Web App..." -ForegroundColor Yellow

# Get SWA deployment token
$SWA_TOKEN = az staticwebapp secrets list `
    --name $SWA_NAME `
    --resource-group $RESOURCE_GROUP `
    --query 'properties.apiKey' `
    --output tsv

# Set production API base URL
$API_URL = "$WEB_APP_URL/api"
Write-Host "Setting API_BASE to: $API_URL" -ForegroundColor Yellow

# Create temp copy with production API base
$FrontendTmp = "frontend-deploy"
if (Test-Path $FrontendTmp) { Remove-Item $FrontendTmp -Recurse -Force }
Copy-Item -Path frontend -Destination $FrontendTmp -Recurse
# Replace API_BASE in config.js (WS_BASE auto-computes from API_BASE)
(Get-Content "$FrontendTmp/config.js") -replace "http://localhost:7071/api", $API_URL | Set-Content "$FrontendTmp/config.js"

# Deploy using SWA CLI
npx --yes @azure/static-web-apps-cli deploy "$FrontendTmp" `
    --deployment-token $SWA_TOKEN `
    --env production

# Cleanup
Remove-Item $FrontendTmp -Recurse -Force

# ==================== DONE ====================

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend:    $SWA_URL" -ForegroundColor Green
Write-Host "Backend API: $API_URL" -ForegroundColor Green
Write-Host ""
Write-Host "Note: The gpt-4o-realtime-preview model may take a few minutes" -ForegroundColor Yellow
Write-Host "to become available after first deployment." -ForegroundColor Yellow
