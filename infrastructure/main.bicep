@description('Location for all resources')
param location string = resourceGroup().location

@description('Base name for resources')
param baseName string = 'haile'

@description('Environment name')
@allowed([
  'dev'
  'prod'
])
param environment string = 'dev'

@description('App access PIN (leave empty to disable auth)')
@secure()
param appPin string = ''

@description('Azure OpenAI endpoint for Realtime API (leave empty to skip realtime mode)')
param realtimeEndpoint string = ''

@description('Realtime API model deployment name')
param realtimeDeployment string = 'gpt-4o-realtime-preview'

// ==================== NAMING ====================

var storageAccountName = 'st${baseName}${environment}'
var webAppName = 'app-${baseName}-${environment}'
var appInsightsName = 'appi-${baseName}-${environment}'
var openAIAccountName = 'openai-${baseName}-${environment}'
var speechAccountName = 'speech-${baseName}-${environment}'
var staticWebAppName = 'swa-${baseName}-${environment}'

// ==================== STORAGE ====================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// ==================== APPLICATION INSIGHTS ====================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
  }
}

// ==================== AZURE OPENAI ====================

resource openAIAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: openAIAccountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAIAccountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

@description('gpt-4o-mini — fast, cheap for SSE streaming chat')
resource gpt4oMiniDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAIAccount
  name: 'gpt-4o-mini'
  sku: {
    name: 'GlobalStandard'  // (C) Global Standard for lowest latency routing
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o-mini'
      version: '2024-07-18'
    }
  }
}

// gpt-4o-realtime-preview skipped — quota shared with greeta2.
// The app falls back to SSE mode automatically.

// ==================== AZURE SPEECH SERVICES ====================

resource speechAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: speechAccountName
  location: location
  kind: 'SpeechServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: speechAccountName
    publicNetworkAccess: 'Enabled'
  }
}

// ==================== STATIC WEB APP (frontend) ====================

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: 'westeurope'  // SWA not available in all regions
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// ==================== APP SERVICE PLAN ====================

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'asp-${baseName}-${environment}'
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true // required for Linux
  }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        {
          name: 'AzureOpenAIEndpoint'
          value: openAIAccount.properties.endpoint
        }
        {
          name: 'AzureOpenAIChatDeployment'
          value: 'gpt-4o-mini'
        }
        {
          name: 'AzureOpenAIRealtimeEndpoint'
          value: realtimeEndpoint
        }
        {
          name: 'AzureOpenAIRealtimeDeployment'
          value: realtimeDeployment
        }
        {
          name: 'AzureOpenAIApiVersion'
          value: '2024-12-01-preview'
        }
        {
          name: 'AzureSpeechRegion'
          value: location
        }
        {
          name: 'AzureSpeechEndpoint'
          value: speechAccount.properties.endpoint
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'AppPin'
          value: appPin
        }
      ]
      cors: {
        allowedOrigins: [
          'http://localhost:8000'
          'http://localhost:3000'
          'http://127.0.0.1:8000'
          'https://${staticWebApp.properties.defaultHostname}'
        ]
      }
      linuxFxVersion: 'PYTHON|3.11'
      appCommandLine: 'python -m uvicorn main:app --host 0.0.0.0 --port 8000'
      webSocketsEnabled: true  // Required for Realtime API proxy
    }
    httpsOnly: true
  }
}

// ==================== RBAC ASSIGNMENTS ====================

// Cognitive Services OpenAI User — for App Service to call OpenAI
resource openAIRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAIAccount.id, webApp.id, '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  scope: openAIAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services User — for App Service to call Speech (token exchange + avatar)
resource speechRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(speechAccount.id, webApp.id, 'a97b65f3-24c7-4388-baec-2e87135dc908')
  scope: speechAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Blob Data Owner — for App Service (general storage if needed)
resource storageBlobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, webApp.id, 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ==================== OUTPUTS ====================

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output openAIEndpoint string = openAIAccount.properties.endpoint
output speechEndpoint string = speechAccount.properties.endpoint
output resourceGroupName string = resourceGroup().name
