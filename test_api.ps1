$ErrorActionPreference = "Stop"

# Disable SSL validation for testing localhost with self-signed certs
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$baseUrl = "https://localhost:8443/api"
$testEmail = "testuser_$(Get-Random)@example.com"
$testPassword = "TestPassword123!"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Running Automated API Tests for Digout  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Test Unauthenticated Endpoint (Autocomplete)
Write-Host "Test 1: Unauthenticated Autocomplete Endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/scan/autocomplete?query=test&countryCode=US" -Method Get
    Write-Host "✅ Passed! Got $($response.Count) suggestions." -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 2. Test User Registration
Write-Host "Test 2: User Registration" -ForegroundColor Yellow
$registerBody = @{
    fullName = "Test User"
    email = $testEmail
    password = $testPassword
    turnstileToken = "1x0000000000000000000000000000000AA" # Dummy token bypasses local check
} | ConvertTo-Json

try {
    $registerRes = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "✅ Passed! User registered successfully." -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 3. Test User Login
Write-Host "Test 3: User Login" -ForegroundColor Yellow
$loginBody = @{
    email = $testEmail
    password = $testPassword
    turnstileToken = "1x0000000000000000000000000000000AA"
} | ConvertTo-Json

$jwt = ""
try {
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $jwt = $loginRes.token
    Write-Host "✅ Passed! Logged in and received JWT." -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. Test Authenticated Endpoint (Get Scan History)
Write-Host "Test 4: Authenticated Request (Scan History)" -ForegroundColor Yellow
if ($jwt) {
    $headers = @{
        "Authorization" = "Bearer $jwt"
    }
    try {
        $historyRes = Invoke-RestMethod -Uri "$baseUrl/scan/history" -Method Get -Headers $headers
        Write-Host "✅ Passed! Retrieved scan history (Count: $($historyRes.Count))." -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ Skipped due to login failure." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Tests Completed!                        " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
