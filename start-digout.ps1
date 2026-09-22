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
    $retries = 30
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
    Write-Host "❌ Docker failed to start automatically. Please start Docker Desktop manually." -ForegroundColor Red
    pause
    exit 1
}

# 2. Launch Docker Compose Containers
Write-Host ""
Write-Host "[2/3] Starting containers (Postgres, Backend, Frontend)..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
docker compose up -d --build

Write-Host " Containers are up and running!" -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend:  https://localhost:8443" -ForegroundColor White
Write-Host "  - Database: localhost:5432" -ForegroundColor White

# 3. Launch Cloudflare HTTPS Tunnel
Write-Host ""
Write-Host "[3/3] Connecting Cloudflare HTTPS Tunnel for Mobile & Remote..." -ForegroundColor Cyan

$cfExe = "C:\Users\gopit\cloudflared\cloudflared.exe"
if (!(Test-Path $cfExe)) {
    $cfExe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
}

if (!(Test-Path $cfExe)) {
    Write-Host "cloudflared.exe not found. Downloading..." -ForegroundColor Yellow
    $cfDir = "C:\Users\gopit\cloudflared"
    if (!(Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir | Out-Null }
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$cfDir\cloudflared.exe" -UseBasicParsing
    $cfExe = "$cfDir\cloudflared.exe"
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Your live HTTPS link will appear below:       " -ForegroundColor Green
Write-Host "  (Look for: https://....trycloudflare.com)      " -ForegroundColor Yellow
Write-Host "=================================================" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the tunnel at any time." -ForegroundColor Gray
Write-Host ""

& $cfExe tunnel --url http://localhost:5173
