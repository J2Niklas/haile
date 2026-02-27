# Start HAILE Frontend
Write-Host "Starting HAILE Frontend..." -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\frontend"

Write-Host "Opening http://localhost:8000 in your browser..." -ForegroundColor Green
Start-Process "http://localhost:8000"

python -m http.server 8000
