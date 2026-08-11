@echo off
setlocal enableextensions
title WorshipHQ Fingerprint Scanner - Uninstall
color 0c

echo(
echo   ============================================
echo     WorshipHQ Fingerprint Scanner - Uninstall
echo   ============================================
echo(
echo   This removes the scanner agent, its auto-start entry,
echo   and the pyzkfp driver. Python itself is left alone.
echo(
pause

set "INSTALL_DIR=%LOCALAPPDATA%\WorshipHQ\Scanner"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

REM ---- 1. Stop the running agent (by its port, 23847) ------
echo   [1/4] Stopping the scanner agent...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":23847" 2^>nul') do taskkill /f /pid %%a >nul 2>&1

REM ---- 2. Remove the auto-start entry (hidden .vbs + old .bat)
echo   [2/4] Removing auto-start...
if exist "%STARTUP_DIR%\WorshipHQ-Scanner.vbs" del /f /q "%STARTUP_DIR%\WorshipHQ-Scanner.vbs" >nul 2>&1
if exist "%STARTUP_DIR%\WorshipHQ-Scanner.bat" del /f /q "%STARTUP_DIR%\WorshipHQ-Scanner.bat" >nul 2>&1

REM ---- 3. Remove the pyzkfp driver (Python is left in place)
echo   [3/4] Removing the scanner driver...
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY ( where py >nul 2>&1 && set "PY=py" )
if defined PY ( %PY% -m pip uninstall -y pyzkfp >nul 2>&1 )

REM ---- 4. Delete the agent folder --------------------------
echo   [4/4] Deleting the agent files...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%" >nul 2>&1
REM Remove the parent WorshipHQ folder too if it is now empty.
rmdir "%LOCALAPPDATA%\WorshipHQ" >nul 2>&1

echo(
echo   ============================================
echo     Done. The scanner agent has been removed.
echo     Nothing WorshipHQ-related is left behind.
echo(
echo     (Python was kept - remove it from Windows
echo      'Add or remove programs' if you don't need it.)
echo   ============================================
echo(
pause
endlocal
