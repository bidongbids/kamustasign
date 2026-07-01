<#
KamustaSign - Windows setup script (Python/ML side)
Run this in PowerShell. Right-click PowerShell -> "Run as administrator" is NOT required
for most of this, but winget installs go smoother if you are an admin.

What this does:
  1. Checks if winget is available (it ships with Windows 10/11 by default).
  2. Installs Python 3.11 SIDE-BY-SIDE with your existing Python (does not touch/replace it).
  3. Creates a project-local virtual environment using Python 3.11 specifically.
  4. Installs all ML dependencies from requirements.txt into that venv.

Usage:
  1. Put this file and requirements.txt in your project root (e.g. kamustasign/ml/).
  2. Open PowerShell in that folder.
  3. If you get an "execution policy" error, run this once first:
       Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  4. Run:  .\setup_python_env_windows.ps1
#>

Write-Host "=== KamustaSign Python/ML environment setup (Windows) ===" -ForegroundColor Cyan

# 1. Check winget
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget not found. Install 'App Installer' from the Microsoft Store, then re-run this script." -ForegroundColor Red
    exit 1
}

# 2. Install Python 3.11 alongside your current Python (uses the official py launcher)
Write-Host "`nChecking for Python 3.11..." -ForegroundColor Yellow
$py311check = & py -3.11 --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Python 3.11 via winget (this will NOT remove your current Python)..." -ForegroundColor Yellow
    winget install --id Python.Python.3.11 -e --source winget
} else {
    Write-Host "Python 3.11 already installed: $py311check" -ForegroundColor Green
}

# 3. Create the virtual environment using Python 3.11 specifically
Write-Host "`nCreating virtual environment (venv) with Python 3.11..." -ForegroundColor Yellow
py -3.11 -m venv venv

# 4. Activate and install dependencies
Write-Host "`nActivating venv and installing requirements..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip

if (Test-Path ".\requirements.txt") {
    pip install -r requirements.txt
} else {
    Write-Host "requirements.txt not found in this folder - download it from the plan and place it here, then run:" -ForegroundColor Red
    Write-Host "  pip install -r requirements.txt"
}

Write-Host "`n=== Done. ===" -ForegroundColor Cyan
Write-Host "Python version in this venv:"
python --version
Write-Host "`nFrom now on, before working on the ML pipeline, activate the venv with:"
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Green
Write-Host "Your other Python installs on this machine are untouched."
