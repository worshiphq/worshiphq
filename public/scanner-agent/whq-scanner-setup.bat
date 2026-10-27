@echo off
REM WorshipHQ Fingerprint Scanner - launcher. Opens the graphical installer
REM (a proper window with a fingerprint + progress). No console stays open.
echo Opening the WorshipHQ scanner installer...
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$p = Join-Path $env:TEMP 'whq-scanner-installer.ps1'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $got = $false; try { Invoke-WebRequest 'https://worshiphq.app/scanner-agent/whq-scanner-installer.ps1' -OutFile $p -UseBasicParsing -TimeoutSec 60; $got = $true } catch { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Could not reach worshiphq.app. Please check your internet connection and try again.', 'WorshipHQ Setup') }; if ($got) { try { & $p } catch { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(('Setup could not start: ' + $_.Exception.Message), 'WorshipHQ Setup') } }"
exit
