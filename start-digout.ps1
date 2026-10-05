# =========================================================
# The Ingredient DigOut - 1-Click Startup Script
# =========================================================

$ErrorActionPreference = "Continue"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "        Starting The Ingredient DigOut           " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Ensure Docker Desktop is Running
Write-Host "[1/3] Checking Docker status..." -ForegroundColor Yellow
$dockerReady = $false
try {
    $null = docker version 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true }
} catch {}

if (-not $dockerReady) {
    Write-Host "Docker daemon is not running. Launching Docker Desktop..." -ForegroundColor Yellow
    $dockerExe = "C:\Users\gopit\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"
    $backendExe = "C:\Users\gopit\AppData\Local\Programs\DockerDesktop\resources\com.docker.backend.exe"
    
    if (Test-Path $dockerExe) {
        Start-Process -FilePath $dockerExe
    } elseif (Test-Path $backendExe) {
        Start-Process -FilePath $backendExe
    }

    Write-Host "Waiting for Docker engine to become ready..." -ForegroundColor Yellow
    $retries = 60
    while ($retries -gt 0) {
        Start-Sleep -Seconds 2
        try {
            $null = docker version 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dockerReady = $true
                break
            }
        } catch {}
        $retries--
    }
}

if ($dockerReady) {
    Write-Host " Docker is ready!" -ForegroundColor Green
} else {
    Write-Host "❌ Docker failed to start automatically within 120s. Please start Docker Desktop manually." -ForegroundColor Red
    exit 1
}

# 2. Launch Docker Compose Containers
Write-Host ""
Write-Host "[2/3] Building and starting containers with latest changes..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker build failed! Please check the error messages above." -ForegroundColor Red
    exit 1
}

Write-Host " Containers are up and running with the latest code changes!" -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend:  https://localhost:8443" -ForegroundColor White
Write-Host "  - Database: Internal Docker Network (Secured & Isolated)" -ForegroundColor White
Write-Host "  [Tip: Press Ctrl + F5 in browser or reopen mobile app to see fresh changes]" -ForegroundColor Gray

# 3. Launch Permanent Ngrok HTTPS Tunnel
Write-Host ""
Write-Host "[3/3] Connecting Permanent HTTPS Tunnel for Mobile & Remote..." -ForegroundColor Cyan

$ngrokExe = "C:\Users\gopit\ngrok\ngrok.exe"
if (!(Test-Path $ngrokExe)) {
    $ngrokExe = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Your PERMANENT HTTPS link is:                  " -ForegroundColor Green
Write-Host "  https://frill-confound-clump.ngrok-free.dev     " -ForegroundColor Yellow
Write-Host "=================================================" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the tunnel at any time." -ForegroundColor Gray
Write-Host ""

& $ngrokExe http 5173 --url https://frill-confound-clump.ngrok-free.dev
