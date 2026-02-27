# Start HAILE Backend
Write-Host "Starting HAILE Backend..." -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\backend"

# Activate virtual environment if it exists
if (Test-Path ".\.venv\Scripts\Activate.ps1") {
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    .\.venv\Scripts\Activate.ps1
} else {
    Write-Host "No .venv found — creating one..." -ForegroundColor Yellow
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
}

Write-Host "Starting FastAPI server on http://localhost:7071 ..." -ForegroundColor Green
python main.py
