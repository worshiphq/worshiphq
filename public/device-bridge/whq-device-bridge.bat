@echo off
title WorshipHQ Device Bridge
cd /d "%~dp0"
where py >nul 2>nul && (py -3 whq-device-bridge.py & goto :done)
where python >nul 2>nul && (python whq-device-bridge.py & goto :done)
echo Python 3 was not found. Install it from https://www.python.org/downloads/ (tick "Add Python to PATH"), then run this again.
:done
pause
