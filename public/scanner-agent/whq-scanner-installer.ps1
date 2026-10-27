# WorshipHQ Fingerprint Scanner - graphical installer (PowerShell + WinForms).
# One installer that brings EVERYTHING with it, so the user never downloads anything else:
#   1. Python (only if the PC has no usable one)
#   2. the scanner helper + its Python package
#   3. the ZKTeco scanner driver (hosted next to this file, checked, installed silently)
#   4. auto-start, then a real check that the helper answers and sees the scanner.
# Everything is written to %LOCALAPPDATA%\WorshipHQ\Scanner\setup.log so a failure can be diagnosed.
# NOTE: keep this file plain ASCII (Windows PowerShell 5.1 reads BOM-less files as ANSI).

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is ~10x faster without the progress bar
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
# Never let a stray UI error pop the scary .NET "Unhandled exception" dialog.
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
[System.Windows.Forms.Application]::add_ThreadException({ param($s,$e) })

$SITE        = "https://worshiphq.app/scanner-agent"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "WorshipHQ\Scanner"
$AGENT_URL   = "$SITE/whq-scanner-agent.py"
$AGENT_PATH  = Join-Path $INSTALL_DIR "whq-scanner-agent.py"
$LOG_PATH    = Join-Path $INSTALL_DIR "setup.log"
$AGENT_PORT  = 23847
# ZKTeco "Fingerprint Reader Standard Driver 5.3.0.33" (Inno Setup). Checked before it is run.
$DRIVER_URL  = "$SITE/zk-driver-setup.exe"
$DRIVER_SHA  = "10A420E2D7A3A7C73B5421638CC7A2A1A7D96D7BED4CC10C3AE9F43F75FAF877"
$PY_URL      = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"

$INK   = [System.Drawing.Color]::FromArgb(24, 22, 18)
$CARD  = [System.Drawing.Color]::FromArgb(32, 30, 26)
$TEAL  = [System.Drawing.Color]::FromArgb(13, 148, 136)
$MUTE  = [System.Drawing.Color]::FromArgb(154, 147, 132)
$GREEN = [System.Drawing.Color]::FromArgb(21, 150, 107)
$RED   = [System.Drawing.Color]::FromArgb(220, 38, 38)

function Log($msg) {
  try {
    New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
    Add-Content -Path $LOG_PATH -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg)
  } catch {}
}

# ---------------------------------------------------------------- window
$form = New-Object System.Windows.Forms.Form
$form.Text = "WorshipHQ Fingerprint Setup"
$form.ClientSize = New-Object System.Drawing.Size(520, 410)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = $INK
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

# Pulsing fingerprint (drawn with GDI+)
$script:pulse = 0
$script:done = $false
$script:failed = $false
$fp = New-Object System.Windows.Forms.Panel
$fp.Size = New-Object System.Drawing.Size(160, 160)
$fp.Location = New-Object System.Drawing.Point(180, 30)
$fp.BackColor = $INK
$fp.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $cx = 80; $cy = 84
  $baseCol = if ($script:failed) { $RED } elseif ($script:done) { $GREEN } else { $TEAL }
  for ($i = 0; $i -lt 6; $i++) {
    $r = 14 + $i * 11
    $glow = [Math]::Max(0, [Math]::Sin(($script:pulse / 6.0) - $i * 0.6))
    $a = [int](70 + 150 * $glow)
    if ($a -gt 255) { $a = 255 }
    $col = [System.Drawing.Color]::FromArgb($a, $baseCol.R, $baseCol.G, $baseCol.B)
    $pen = New-Object System.Drawing.Pen($col, 3)
    $g.DrawArc($pen, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2), (200 + $i * 8), 200)
    $pen.Dispose()
  }
  if ($script:done) {
    $pen = New-Object System.Drawing.Pen($GREEN, 6)
    $g.DrawLines($pen, @(
      (New-Object System.Drawing.Point(56, 86)),
      (New-Object System.Drawing.Point(74, 104)),
      (New-Object System.Drawing.Point(108, 62))
    ))
    $pen.Dispose()
  }
})
$form.Controls.Add($fp)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Setting up your fingerprint scanner"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 13)
$title.ForeColor = [System.Drawing.Color]::White
$title.TextAlign = "MiddleCenter"
$title.Location = New-Object System.Drawing.Point(30, 200)
$title.Size = New-Object System.Drawing.Size(460, 28)
$form.Controls.Add($title)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Getting started..."
$status.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$status.ForeColor = $MUTE
$status.TextAlign = "MiddleCenter"
$status.Location = New-Object System.Drawing.Point(30, 232)
$status.Size = New-Object System.Drawing.Size(460, 46)
$form.Controls.Add($status)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = "Continuous"
$bar.Minimum = 0; $bar.Maximum = 100; $bar.Value = 0
$bar.Location = New-Object System.Drawing.Point(60, 290)
$bar.Size = New-Object System.Drawing.Size(400, 10)
$form.Controls.Add($bar)

$detail = New-Object System.Windows.Forms.Label
$detail.Text = ""
$detail.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$detail.ForeColor = $MUTE
$detail.TextAlign = "MiddleCenter"
$detail.Location = New-Object System.Drawing.Point(30, 308)
$detail.Size = New-Object System.Drawing.Size(460, 18)
$form.Controls.Add($detail)

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "Please wait..."
$btn.Enabled = $false
$btn.FlatStyle = "Flat"
$btn.FlatAppearance.BorderSize = 0
$btn.BackColor = $CARD
$btn.ForeColor = $MUTE
$btn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$btn.Size = New-Object System.Drawing.Size(220, 40)
$btn.Location = New-Object System.Drawing.Point(150, 346)
$btn.Add_Click({ $form.Close() })
$form.Controls.Add($btn)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 60
$timer.Add_Tick({ $script:pulse++; $fp.Invalidate() })
$timer.Start()

function Set-Step($text, $pct) {
  $status.Text = $text
  Log $text
  try {
    if ($null -ne $pct) {
      $v = [int]$pct
      if ($v -lt 0) { $v = 0 }
      if ($v -gt 100) { $v = 100 }
      $bar.Value = $v
    }
  } catch {}
  [System.Windows.Forms.Application]::DoEvents()
}

# ---------------------------------------------------------------- helpers
# Runs a program and waits, keeping the window alive. Never throws on stderr output
# (Windows PowerShell 5.1 turns ANY native stderr line into an error when ErrorActionPreference is Stop,
# which is what used to kill this installer on PCs without Python).
function Run-Native($file, $argString) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $file
  $psi.Arguments = $argString
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $so = $p.StandardOutput.ReadToEndAsync()
  $se = $p.StandardError.ReadToEndAsync()
  while (-not $p.WaitForExit(150)) { [System.Windows.Forms.Application]::DoEvents() }
  $p.WaitForExit()
  return @{ Code = $p.ExitCode; Out = [string]$so.Result; Err = [string]$se.Result }
}

function Tail($text, $n) {
  $lines = @(([string]$text) -split "`r?`n" | Where-Object { $_.Trim() })
  if ($lines.Count -eq 0) { return "" }
  return (($lines | Select-Object -Last $n) -join " | ")
}

function Get-File($url, $out) {
  $last = $null
  for ($i = 1; $i -le 3; $i++) {
    try {
      Log "download $url (try $i)"
      Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 600
      if ((Test-Path $out) -and ((Get-Item $out).Length -gt 0)) { return }
    } catch { $last = $_.Exception.Message; Log "download failed: $last" }
    Start-Sleep -Seconds 2
  }
  throw "Couldn't download a file the scanner needs. Check the internet connection and run setup again."
}

function Test-Py($p) {
  if (-not $p) { return $false }
  if ($p -match "WindowsApps") { return $false }      # the Microsoft Store stub, not real Python
  if (-not (Test-Path -LiteralPath $p)) { return $false }
  try {
    $r = Run-Native $p '-c "import sys; print(sys.version_info[0]*100+sys.version_info[1])"'
    if ($r.Code -ne 0) { return $false }
    $v = [int]($r.Out.Trim())
    return ($v -ge 308 -and $v -le 313)               # versions the scanner package supports
  } catch { return $false }
}

function Find-Python {
  $cands = New-Object System.Collections.ArrayList
  foreach ($v in @("312", "313", "311", "310", "39")) {
    [void]$cands.Add((Join-Path $env:LOCALAPPDATA "Programs\Python\Python$v\python.exe"))
    [void]$cands.Add((Join-Path $env:ProgramFiles "Python$v\python.exe"))
    [void]$cands.Add("C:\Python$v\python.exe")
  }
  foreach ($hive in @("HKCU:", "HKLM:")) {
    try {
      foreach ($k in @(Get-ChildItem "$hive\SOFTWARE\Python\PythonCore" -ErrorAction SilentlyContinue)) {
        $ip = Get-ItemProperty -Path ($k.PSPath + "\InstallPath") -ErrorAction SilentlyContinue
        if ($ip -and $ip.ExecutablePath) { [void]$cands.Add($ip.ExecutablePath) }
        elseif ($ip -and $ip.'(default)') { [void]$cands.Add((Join-Path $ip.'(default)' "python.exe")) }
      }
    } catch {}
  }
  try { foreach ($c in @(Get-Command python.exe -All -ErrorAction SilentlyContinue)) { [void]$cands.Add($c.Source) } } catch {}
  foreach ($p in ($cands | Select-Object -Unique)) {
    if (Test-Py $p) { Log "python found: $p"; return $p }
  }
  Log "no usable python found"
  return $null
}

function Test-ZkDriver {
  return ((Test-Path "$env:windir\System32\libzkfp.dll") -or (Test-Path "$env:windir\Sysnative\libzkfp.dll"))
}

function Get-AgentStatus {
  try { return Invoke-RestMethod -Uri "http://127.0.0.1:$AGENT_PORT/status" -TimeoutSec 3 } catch { return $null }
}

# ---------------------------------------------------------------- the install
$form.Add_Shown({
  try {
    Log "---- setup started ----"
    try { Log ("Windows: " + [Environment]::OSVersion.VersionString + ", 64-bit: " + [Environment]::Is64BitOperatingSystem) } catch {}
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null

    # 1. Internet
    Set-Step "Checking the internet connection..." 4
    try { Invoke-WebRequest -Uri "$SITE/whq-scanner-agent.py" -Method Head -UseBasicParsing -TimeoutSec 20 | Out-Null }
    catch { throw "Couldn't reach worshiphq.app. Please check the internet connection and run setup again." }

    # 2. Python
    Set-Step "Checking for Python..." 8
    $py = Find-Python
    if (-not $py) {
      Set-Step "Installing Python (one time, about a minute)..." 12
      $pyExe = Join-Path $env:TEMP "whq-python-3.12.8-amd64.exe"
      Get-File $PY_URL $pyExe
      Set-Step "Installing Python (one time, about a minute)..." 22
      $r = Run-Native $pyExe "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=0 Include_test=0 Include_doc=0 Shortcuts=0"
      Log ("python installer exit code " + $r.Code + " " + (Tail $r.Err 3))
      Start-Sleep -Seconds 2
      $py = Find-Python
    }
    if (-not $py) { throw "Python could not be installed automatically. Open the setup log for details and send it to WorshipHQ support." }
    $pyw = $py -replace "python\.exe$", "pythonw.exe"
    if (-not (Test-Path $pyw)) { $pyw = $py }

    # 3. Scanner helper + package
    Set-Step "Downloading the scanner helper..." 34
    Get-File $AGENT_URL $AGENT_PATH
    Set-Step "Installing scanner software..." 42
    $r = Run-Native $py "-m pip install --disable-pip-version-check --no-warn-script-location --upgrade pip"
    Log ("pip upgrade exit " + $r.Code)       # not fatal: an old pip is fine
    $ok = $false
    for ($i = 1; $i -le 2 -and -not $ok; $i++) {
      $r = Run-Native $py "-m pip install --disable-pip-version-check --no-warn-script-location pyzkfp"
      Log ("pip pyzkfp try $i exit " + $r.Code + " " + (Tail $r.Err 4))
      if ($r.Code -eq 0) { $ok = $true }
    }
    if (-not $ok) { throw ("Couldn't install the scanner software: " + (Tail $r.Err 2)) }

    # 4. ZKTeco driver (carried with WorshipHQ so nobody has to find it)
    if (Test-ZkDriver) {
      Log "ZKTeco driver already present"
    } else {
      Set-Step "Downloading the scanner driver..." 56
      $drv = Join-Path $env:TEMP "whq-zk-driver-setup.exe"
      Get-File $DRIVER_URL $drv
      $sha = (Get-FileHash -Path $drv -Algorithm SHA256).Hash
      if ($sha -ne $DRIVER_SHA) { Remove-Item $drv -Force -ErrorAction SilentlyContinue; throw "The scanner driver download was damaged. Please run setup again." }

      Set-Step "Installing the scanner driver - click Yes when Windows asks permission..." 66
      try {
        $p = Start-Process -FilePath $drv -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-" -Verb RunAs -PassThru
        while (-not $p.WaitForExit(200)) { [System.Windows.Forms.Application]::DoEvents() }
        Log ("driver installer (silent) exit " + $p.ExitCode)
      } catch {
        Log ("driver launch failed: " + $_.Exception.Message)
        throw "The scanner driver needs your permission. Run setup again and click Yes when Windows asks."
      }
      if (-not (Test-ZkDriver)) {
        # Silent mode did not take; show the vendor's own window instead of failing.
        Set-Step "Finish the driver window that just opened (press Next / Install / Finish)..." 70
        try {
          $p = Start-Process -FilePath $drv -Verb RunAs -PassThru
          while (-not $p.WaitForExit(200)) { [System.Windows.Forms.Application]::DoEvents() }
          Log ("driver installer (window) exit " + $p.ExitCode)
        } catch { Log ("driver window failed: " + $_.Exception.Message) }
      }
      Start-Sleep -Seconds 2
      if (-not (Test-ZkDriver)) { throw "The scanner driver didn't finish installing. Run setup again and click Yes when Windows asks." }
    }

    # 5. Start the helper (hidden) and register auto-start
    Set-Step "Starting the scanner helper..." 82
    $r = Run-Native $py ('"' + $AGENT_PATH + '" --install')
    Log ("agent --install exit " + $r.Code + " " + (Tail $r.Out 2))
    $st = Get-AgentStatus
    if (-not $st) {
      Start-Process -FilePath $pyw -ArgumentList ('"' + $AGENT_PATH + '"') -WindowStyle Hidden
      for ($i = 0; $i -lt 40 -and -not $st; $i++) {
        Start-Sleep -Milliseconds 500
        [System.Windows.Forms.Application]::DoEvents()
        $st = Get-AgentStatus
      }
    }
    if (-not $st) { throw "The scanner helper didn't start. Details are in the setup log (agent.log in the same folder)." }

    # 6. Is the scanner itself seen?
    Set-Step "Looking for your scanner..." 92
    for ($i = 0; $i -lt 24 -and -not $st.connected; $i++) {
      Start-Sleep -Milliseconds 500
      [System.Windows.Forms.Application]::DoEvents()
      $again = Get-AgentStatus
      if ($again) { $st = $again }
    }
    Log ("final status: connected=" + $st.connected + " scanner=" + $st.scanner)

    $script:done = $true
    $fp.Invalidate()
    $bar.Value = 100
    if ($st.connected) {
      $title.Text = "All set"
      $status.Text = "Scanner ready! It runs quietly in the background."
    } else {
      $title.Text = "Installed - one last step"
      $status.Text = "Unplug the scanner and plug it back in, then press Retry on the WorshipHQ page."
    }
    $title.ForeColor = $GREEN
    $btn.Text = "Done - back to WorshipHQ"
    $btn.BackColor = $TEAL
    $btn.ForeColor = [System.Drawing.Color]::White
    $btn.Enabled = $true
  }
  catch {
    $script:failed = $true
    $fp.Invalidate()
    Log ("FAILED: " + $_.Exception.Message)
    try { Log ($_.ScriptStackTrace) } catch {}
    $title.Text = "Setup couldn't finish"
    $title.ForeColor = $RED
    $status.ForeColor = $RED
    $status.Text = $_.Exception.Message
    $detail.Text = "Details: " + $LOG_PATH
    $btn.Text = "Close"
    $btn.BackColor = $CARD
    $btn.ForeColor = [System.Drawing.Color]::White
    $btn.Enabled = $true
  }
})

[System.Windows.Forms.Application]::Run($form)
