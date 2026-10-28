# Builds public/scanner-agent/whq-scanner-runtime.zip: the "scanner engine" the setup exe downloads.
# It is Python 3.12.8 (the official embeddable build from python.org) with pythonnet and pyzkfp already inside,
# so a church PC needs one ~12 MB download and an unzip instead of the Python installer plus pip.
# Pillow is left out on purpose: pyzkfp only uses it for saving images, never for capture or matching.
# Needs any local Python with pip. After running, paste the printed SHA-256 into Cfg.RuntimeSha256 in Program.cs and rebuild.
#   powershell -ExecutionPolicy Bypass -File tools\scanner-installer\build-runtime.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here "..\..")
$out  = Join-Path $repo "public\scanner-agent\whq-scanner-runtime.zip"
$work = Join-Path $env:TEMP "whq-runtime-build"
$rt   = Join-Path $work "runtime"
$embed = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip"

if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force $rt | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest $embed -OutFile (Join-Path $work "embed.zip") -UseBasicParsing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $work "embed.zip"), $rt)

# Let the embedded Python see site-packages.
Set-Content -Path (Join-Path $rt "python312._pth") -Encoding ascii -Value "python312.zip`r`n.`r`nLib\site-packages`r`n`r`nimport site"

$site = Join-Path $rt "Lib\site-packages"
& python -m pip install -q --disable-pip-version-check --no-compile --target $site --only-binary=:all: --python-version 3.12 --platform win_amd64 --implementation cp --abi cp312 pythonnet
if ($LASTEXITCODE -ne 0) { throw "pythonnet install failed" }
& python -m pip install -q --disable-pip-version-check --no-compile --target $site --no-deps pyzkfp
if ($LASTEXITCODE -ne 0) { throw "pyzkfp install failed" }
Get-ChildItem $rt -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force
if (Test-Path (Join-Path $site "bin")) { Remove-Item (Join-Path $site "bin") -Recurse -Force }

# Check it loads before shipping it.
& (Join-Path $rt "python.exe") -c "import clr, pyzkfp; print('engine ok')"
if ($LASTEXITCODE -ne 0) { throw "the engine does not load" }

if (Test-Path $out) { Remove-Item $out -Force }
[IO.Compression.ZipFile]::CreateFromDirectory($rt, $out, [IO.Compression.CompressionLevel]::Optimal, $false)
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
"built: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
"SHA-256: $hash  (put this in Cfg.RuntimeSha256)"
