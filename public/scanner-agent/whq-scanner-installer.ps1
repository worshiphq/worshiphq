# WorshipHQ Fingerprint Scanner — graphical installer (PowerShell + WinForms).
# Runs before Python exists (WinForms ships with Windows). Draws a friendly
# window with a pulsing fingerprint + stepped status, does the real work in the
# background, and finishes with a success screen.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
# Never let a stray UI error pop the scary .NET "Unhandled exception" dialog.
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
[System.Windows.Forms.Application]::add_ThreadException({ param($s,$e) })

$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "WorshipHQ\Scanner"
$AGENT_URL   = "https://worshiphq.app/scanner-agent/whq-scanner-agent.py"
$AGENT_PATH  = Join-Path $INSTALL_DIR "whq-scanner-agent.py"

$INK   = [System.Drawing.Color]::FromArgb(24, 22, 18)
$CARD  = [System.Drawing.Color]::FromArgb(32, 30, 26)
$TEAL  = [System.Drawing.Color]::FromArgb(13, 148, 136)
$TEALB = [System.Drawing.Color]::FromArgb(20, 184, 166)
$MUTE  = [System.Drawing.Color]::FromArgb(154, 147, 132)
$GREEN = [System.Drawing.Color]::FromArgb(21, 150, 107)
$RED   = [System.Drawing.Color]::FromArgb(220, 38, 38)

$form = New-Object System.Windows.Forms.Form
$form.Text = "WorshipHQ Fingerprint Setup"
$form.ClientSize = New-Object System.Drawing.Size(520, 400)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = $INK
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

# ── Pulsing fingerprint (drawn with GDI+) ──
$script:pulse = 0
$script:done = $false
$script:failed = $false
$fp = New-Object System.Windows.Forms.Panel
$fp.Size = New-Object System.Drawing.Size(160, 160)
$fp.Location = New-Object System.Drawing.Point(180, 34)
$fp.BackColor = $INK
$fp.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $cx = 80; $cy = 84
  $baseCol = if ($script:failed) { $RED } elseif ($script:done) { $GREEN } else { $TEAL }
  $wave = [Math]::Sin($script:pulse / 6.0)
  for ($i = 0; $i -lt 6; $i++) {
    $r = 14 + $i * 11
    $glow = [Math]::Max(0, [Math]::Sin(($script:pulse / 6.0) - $i * 0.6))
    $a = [int](70 + 150 * $glow)
    if ($a -gt 255) { $a = 255 }
    $col = [System.Drawing.Color]::FromArgb($a, $baseCol.R, $baseCol.G, $baseCol.B)
    $pen = New-Object System.Drawing.Pen($col, 3)
    # Fingerprint-like: broken concentric arcs
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
$title.Location = New-Object System.Drawing.Point(30, 208)
$title.Size = New-Object System.Drawing.Size(460, 28)
$form.Controls.Add($title)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Getting started..."
$status.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$status.ForeColor = $MUTE
$status.TextAlign = "MiddleCenter"
$status.Location = New-Object System.Drawing.Point(30, 240)
$status.Size = New-Object System.Drawing.Size(460, 22)
$form.Controls.Add($status)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = "Continuous"
$bar.Minimum = 0; $bar.Maximum = 100; $bar.Value = 0
$bar.Location = New-Object System.Drawing.Point(60, 278)
$bar.Size = New-Object System.Drawing.Size(400, 10)
$form.Controls.Add($bar)

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "Please wait..."
$btn.Enabled = $false
$btn.FlatStyle = "Flat"
$btn.FlatAppearance.BorderSize = 0
$btn.BackColor = $CARD
$btn.ForeColor = $MUTE
$btn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$btn.Size = New-Object System.Drawing.Size(200, 40)
$btn.Location = New-Object System.Drawing.Point(160, 320)
$btn.Add_Click({ $form.Close() })
$form.Controls.Add($btn)

# Pulse animation timer
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 60
$timer.Add_Tick({ $script:pulse++; $fp.Invalidate() })
$timer.Start()

function Set-Step($text, $pct) {
  $status.Text = $text
  try {
    if ($null -ne $pct -and [int]$pct -ge 0) {
      $v = [int]$pct
      if ($v -lt 0) { $v = 0 }
      if ($v -gt 100) { $v = 100 }
      $bar.Value = $v
    }
  } catch {}
  [System.Windows.Forms.Application]::DoEvents()
}

function Find-Python {
  foreach ($c in @("python", "py")) {
    $p = (& cmd /c "where $c" 2>$null | Select-Object -First 1)
    if ($p -and (Test-Path $p)) { return $p }
  }
  $roots = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python"),
    "C:\Python312", "C:\Python311", "C:\Program Files\Python312"
  )
  foreach ($r in $roots) {
    if (Test-Path $r) {
      $hit = Get-ChildItem $r -Recurse -Filter "python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { return $hit.FullName }
    }
  }
  return $null
}

# ── The actual install, stepped, once the window is shown ──
$form.Add_Shown({
  try {
    Set-Step "Checking for Python..." 8
    Start-Sleep -Milliseconds 400
    $py = Find-Python

    if (-not $py) {
      Set-Step "Installing Python (one-time, please wait)..." 20
      $wg = (& cmd /c "where winget" 2>$null | Select-Object -First 1)
      if ($wg) {
        Start-Process -FilePath "winget" -ArgumentList "install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements" -Wait -WindowStyle Hidden
        Start-Sleep -Seconds 2
        $py = Find-Python
      }
    }
    if (-not $py) { throw "Python could not be installed automatically. Please install Python from python.org (tick 'Add to PATH'), then run this again." }

    $pyw = $py -replace "python\.exe$", "pythonw.exe"
    if (-not (Test-Path $pyw)) { $pyw = $py }

    Set-Step "Downloading the scanner agent..." 45
    New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $AGENT_URL -OutFile $AGENT_PATH -UseBasicParsing

    Set-Step "Installing fingerprint drivers..." 68
    & $py -m pip install --quiet --upgrade pip 2>$null
    & $py -m pip install --quiet pyzkfp 2>$null

    Set-Step "Registering auto-start..." 88
    & $py $AGENT_PATH --install 2>$null
    Start-Process -FilePath $pyw -ArgumentList "`"$AGENT_PATH`"" -WindowStyle Hidden

    Set-Step "Almost there..." 96
    Start-Sleep -Milliseconds 500

    $script:done = $true
    $fp.Invalidate()
    Set-Step "Scanner ready! It runs quietly in the background." 100
    $title.Text = "All set"
    $title.ForeColor = $GREEN
    $btn.Text = "Done - back to WorshipHQ"
    $btn.BackColor = $TEAL
    $btn.ForeColor = [System.Drawing.Color]::White
    $btn.Enabled = $true
  }
  catch {
    $script:failed = $true
    $fp.Invalidate()
    $title.Text = "Setup couldn't finish"
    $title.ForeColor = $RED
    $status.ForeColor = $RED
    Set-Step $_.Exception.Message 0
    $btn.Text = "Close"
    $btn.BackColor = $CARD
    $btn.ForeColor = [System.Drawing.Color]::White
    $btn.Enabled = $true
  }
})

[System.Windows.Forms.Application]::Run($form)
