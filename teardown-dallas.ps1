# Teardown script for HAILE Dallas demo
# Deletes the entire rg-haile-dallas resource group and all resources within it.

$RESOURCE_GROUP = "rg-haile-dallas"

Write-Host "Tearing down HAILE Dallas demo" -ForegroundColor Yellow
Write-Host "Resource Group: $RESOURCE_GROUP" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Are you sure you want to delete ALL resources in '$RESOURCE_GROUP'? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Cancelled." -ForegroundColor Red
    exit 0
}

Write-Host "Deleting resource group '$RESOURCE_GROUP'..." -ForegroundColor Yellow
az group delete --name $RESOURCE_GROUP --yes --no-wait

Write-Host ""
Write-Host "Resource group deletion initiated (runs in background)." -ForegroundColor Green
Write-Host "It may take a few minutes for all resources to be removed." -ForegroundColor Yellow
