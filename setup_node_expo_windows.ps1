<#
KamustaSign - Windows setup script (Node.js / Expo side)

What this does:
  1. Installs nvm-windows if missing (lets you manage multiple Node versions).
  2. Installs and switches to Node.js 24 (current Active LTS).
  3. Installs your Expo project's npm dependencies using expo-compatible versions.

Usage:
  1. Run this from your Expo project root (the kamustasign/ folder with package.json).
  2. If you get an "execution policy" error, run this once first:
       Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  3. Run:  .\setup_node_expo_windows.ps1
#>

Write-Host "=== KamustaSign Node/Expo environment setup (Windows) ===" -ForegroundColor Cyan

# 1. Install nvm-windows if missing
if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
    Write-Host "`nnvm-windows not found." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Installing nvm-windows via winget..."
        winget install --id CoreyButler.NVMforWindows -e --source winget
        Write-Host "Installed. Close and reopen PowerShell, then re-run this script." -ForegroundColor Red
        exit 0
    } else {
        Write-Host "winget not found. Install nvm-windows manually from:"
        Write-Host "  https://github.com/coreybutler/nvm-windows/releases"
        exit 1
    }
} else {
    Write-Host "nvm-windows already installed." -ForegroundColor Green
}

# 2. Install and use Node 24 (current Active LTS)
Write-Host "`nInstalling Node.js 24 (Active LTS)..." -ForegroundColor Yellow
nvm install 24
nvm use 24

Write-Host "`nNode version now active:"
node --version
npm --version

# 3. Install Expo project dependencies
if (Test-Path ".\package.json") {
    Write-Host "`nInstalling project dependencies..." -ForegroundColor Yellow
    npm install

    Write-Host "`nInstalling Expo-managed packages (SDK-matched versions)..." -ForegroundColor Yellow
    npx expo install expo@^56.0.0 `
        @react-navigation/native `
        @react-navigation/native-stack `
        @supabase/supabase-js `
        @tensorflow/tfjs `
        @tensorflow/tfjs-react-native `
        expo-camera `
        @react-native-async-storage/async-storage

    Write-Host "`nRunning expo-doctor to catch version mismatches..." -ForegroundColor Yellow
    npx expo-doctor
} else {
    Write-Host "`nNo package.json found here. Run this script from your kamustasign/ project root" -ForegroundColor Red
    Write-Host "(the folder from kamustasign.zip that already has package.json in it)."
}

Write-Host "`n=== Done. ===" -ForegroundColor Cyan
Write-Host "Start the app with:  npx expo start --web" -ForegroundColor Green
