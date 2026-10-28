# Builds public/scanner-agent/WorshipHQ-Scanner-Setup.exe with the C# compiler that ships with Windows.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File tools\scanner-installer\build.ps1
# Keep the sources C# 5 (the inbox compiler). The engine, driver and helper are NOT inside the exe; it downloads
# them from worshiphq.app/scanner-agent, so a new helper never needs a new exe. The engine zip is made by build-runtime.ps1.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here "..\..")
$out  = Join-Path $repo "public\scanner-agent\WorshipHQ-Scanner-Setup.exe"
$ico  = Join-Path $here "app.ico"
$mark = Join-Path $repo "public\icon2.png"
$csc  = "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "$env:windir\Microsoft.NET\Framework\v4.0.30319\csc.exe" }

# 1. Icon: the WorshipHQ mark on a white rounded tile, so it shows on dark and light folders alike (PNG-in-ICO, 16/24/32/48/64/256)
$self = Get-Item $MyInvocation.MyCommand.Path
if (-not (Test-Path $ico) -or (Get-Item $mark).LastWriteTime -gt (Get-Item $ico).LastWriteTime -or $self.LastWriteTime -gt (Get-Item $ico).LastWriteTime) {
  Add-Type -AssemblyName System.Drawing
  $src = [System.Drawing.Image]::FromFile($mark)
  # The mark's visible area inside the 1024px file (found by scanning its transparent edges).
  $crop = New-Object System.Drawing.Rectangle 20, 105, 984, 814
  $sizes = 16, 24, 32, 48, 64, 256
  $pngs = @()
  foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    # White rounded tile with a hairline edge
    $r = [Math]::Max(2, [int]($s * 0.22)); $d = $r * 2; $w = $s - 1
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($w - $d, 0, $d, $d, 270, 90)
    $path.AddArc($w - $d, $w - $d, $d, $d, 0, 90); $path.AddArc(0, $w - $d, $d, $d, 90, 90); $path.CloseFigure()
    $g.FillPath([System.Drawing.Brushes]::White, $path)
    if ($s -ge 32) { $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 20, 57, 120)), 1; $g.DrawPath($pen, $path); $pen.Dispose() }
    # The mark, centred with padding
    $pad = [Math]::Max(1, [int]($s * 0.12)); $box = $s - 2 * $pad
    $mw = $box; $mh = [int]($box * $crop.Height / $crop.Width)
    $dest = New-Object System.Drawing.Rectangle ($pad), ([int](($s - $mh) / 2)), $mw, $mh
    $g.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $path.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , $ms.ToArray()
    $bmp.Dispose(); $ms.Dispose()
  }
  $src.Dispose()
  $fs = [System.IO.File]::Create($ico)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$offset)
    $offset += $pngs[$i].Length
  }
  foreach ($p in $pngs) { $bw.Write($p) }
  $bw.Close(); $fs.Close()
  Write-Host "icon built"
}

# 1b. Header logo (the wide WorshipHQ logo, 2x for sharp screens), embedded in the exe as "Logo.png"
$headerLogo = Join-Path $here "logo-header.png"
$wide = Join-Path $repo "public\logo2.png"
if (-not (Test-Path $headerLogo) -or (Get-Item $wide).LastWriteTime -gt (Get-Item $headerLogo).LastWriteTime) {
  Add-Type -AssemblyName System.Drawing
  $src = [System.Drawing.Image]::FromFile($wide)
  $w = 760; $h = [int]($src.Height * $w / $src.Width)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose(); $src.Dispose()
  $bmp.Save($headerLogo, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "header logo built"
}

# 2. Compile
& $csc /nologo /target:winexe /platform:anycpu /optimize+ "/win32icon:$ico" "/win32manifest:$(Join-Path $here 'app.manifest')" "/resource:$headerLogo,Logo.png" "/out:$out" `
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
  (Join-Path $here "Program.cs") (Join-Path $here "AssemblyInfo.cs")
if ($LASTEXITCODE -ne 0) { throw "compile failed" }

# 3. Self-check (no window, no installs)
$report = Join-Path $env:TEMP "whq-setup-selftest.txt"
if (Test-Path $report) { Remove-Item $report -Force }
$p = Start-Process -FilePath $out -ArgumentList "--selftest `"$report`"" -Wait -PassThru
if (-not (Test-Path $report)) { throw "self-test did not run (exit $($p.ExitCode))" }
Get-Content $report
"built: $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
