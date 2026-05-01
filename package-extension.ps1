# ScamStop Extension Packager
# Run from the ScamStop extension project root:
#   powershell -ExecutionPolicy Bypass -File package-extension.ps1

param(
    [string]$RenderUrl = ""
)

Write-Host "=== ScamStop Extension Packager ===" -ForegroundColor Cyan

# 1. Validate Render URL
if (-not $RenderUrl) {
    $RenderUrl = Read-Host "Enter your Render API URL (e.g. https://scamstop-api.onrender.com)"
}
if (-not $RenderUrl.StartsWith("https://")) {
    Write-Host "ERROR: URL must start with https://" -ForegroundColor Red
    exit 1
}

# 2. Patch background.js with the real URL
Write-Host "Patching background.js with API URL..." -ForegroundColor Yellow
$bgPath = "browser-extension\background.js"
$bg = Get-Content $bgPath -Raw
$bg = $bg -replace "https://YOUR_RENDER_URL", $RenderUrl
Set-Content $bgPath -Value $bg

# 3. Patch environment.prod.ts
Write-Host "Patching environment.prod.ts..." -ForegroundColor Yellow
$envPath = "src\environments\environment.prod.ts"
$env = Get-Content $envPath -Raw
$env = $env -replace "https://YOUR_RENDER_URL", $RenderUrl
Set-Content $envPath -Value $env

# 4. Build
Write-Host "Building production bundle..." -ForegroundColor Yellow
npx ng build --configuration production
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

# 5. Package
$zipPath = "scamstop-extension.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath }
Compress-Archive -Path "dist\ScamStop\browser\*" -DestinationPath $zipPath
Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Extension packaged: $zipPath" -ForegroundColor Green
Write-Host "Upload this file to the Chrome Web Store Developer Dashboard." -ForegroundColor Green
