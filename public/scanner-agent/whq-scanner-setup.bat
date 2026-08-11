@echo off
setlocal enableextensions
title WorshipHQ Fingerprint Scanner - Setup
color 0b

echo(
echo   ============================================
echo     WorshipHQ Fingerprint Scanner - Setup
echo   ============================================
echo(
echo   This installs the fingerprint scanner service on this
echo   computer. It only needs to run once - after that the
echo   scanner starts automatically every time you log in.
echo(

set "INSTALL_DIR=%LOCALAPPDATA%\WorshipHQ\Scanner"
set "AGENT_URL=https://worshiphq.app/scanner-agent/whq-scanner-agent.py"
set "AGENT_PATH=%INSTALL_DIR%\whq-scanner-agent.py"

REM ---- 1. Ensure Python -----------------------------------
echo   [1/4] Checking for Python...
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY ( where py >nul 2>&1 && set "PY=py" )

if not defined PY (
    echo         Python not found. Trying to install it for you...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        echo(
        echo   [!] Python was just installed. Please close this window and
        echo       run this file ONE more time to finish setup.
        echo(
        pause
        exit /b 0
    ) else (
        echo(
        echo   [!] Could not install Python automatically.
        echo       Please install Python from https://www.python.org/downloads
        echo       ^(tick "Add python.exe to PATH"^), then run this file again.
        echo(
        pause
        exit /b 1
    )
)
echo         Found: %PY%

REM ---- 2. Download the agent -------------------------------
echo   [2/4] Downloading the scanner agent...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
powershell -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%AGENT_URL%' -OutFile '%AGENT_PATH%' -UseBasicParsing } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo   [!] Download failed. Check your internet connection and retry.
    pause
    exit /b 1
)

REM ---- 3. Install scanner drivers --------------------------
echo   [3/4] Installing scanner drivers ^(this can take a minute^)...
%PY% -m pip install --quiet --upgrade pip >nul 2>&1
%PY% -m pip install --quiet pyzkfp
if %errorlevel% neq 0 (
    echo         Note: driver install had a warning. The demo scanner will
    echo         still work; plug-and-play hardware may need vendor drivers.
)

REM ---- 4. Register auto-start and launch (hidden, no window) ----
echo   [4/4] Registering auto-start and starting the scanner...
set "PYW=pythonw"
if /I "%PY%"=="py" set "PYW=pyw"
REM Register the hidden auto-start entry (this exits immediately)...
%PY% "%AGENT_PATH%" --install
REM ...then start it now, hidden (pythonw = no console window).
start "" %PYW% "%AGENT_PATH%"

echo(
echo   ============================================
echo     Done! The scanner now runs invisibly in the
echo     background and starts automatically at log in
echo     - no window will stay open.
echo(
echo     Go back to WorshipHQ and click "Retry".
echo     You can close this window now.
echo   ============================================
echo(
pause
endlocal
