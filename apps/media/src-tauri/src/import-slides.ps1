# WorshipHQ Media: turn a PowerPoint or PDF into one picture per slide/page.
# Usage: powershell -File import-slides.ps1 <file> <output folder>
# Prints one JSON line per picture: {"type":"slide","path":"..."} and finally {"type":"done","count":n}
# or {"type":"error","message":"..."}.

param([string]$Source, [string]$OutDir)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Send-Msg($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ext = [IO.Path]::GetExtension($Source).ToLowerInvariant()

try {
    if ($ext -eq '.pdf') {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
        $asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
        function Wait-Op($op, [Type]$type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
        function Wait-Action($op) { $t = $asTaskAction.Invoke($null, @($op)); $t.Wait(-1) | Out-Null }
        [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
        [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
        [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

        $file = Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Source)) ([Windows.Storage.StorageFile])
        $doc = Wait-Op ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
        $folder = Wait-Op ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($OutDir)) ([Windows.Storage.StorageFolder])
        for ($i = 0; $i -lt $doc.PageCount; $i++) {
            $page = $doc.GetPage($i)
            $name = 'page-{0:D3}.png' -f ($i + 1)
            $out = Wait-Op ($folder.CreateFileAsync($name, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
            $stream = Wait-Op ($out.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
            $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
            $opts.DestinationWidth = 1920
            Wait-Action ($page.RenderToStreamAsync($stream, $opts))
            $stream.Dispose(); $page.Dispose()
            Send-Msg @{ type = 'slide'; path = (Join-Path $OutDir $name) }
        }
        Send-Msg @{ type = 'done'; count = [int]$doc.PageCount }
    }
    elseif ($ext -in @('.ppt', '.pptx', '.pps', '.ppsx', '.odp')) {
        try { $ppt = New-Object -ComObject PowerPoint.Application }
        catch { Send-Msg @{ type = 'error'; message = 'Microsoft PowerPoint is needed to import PowerPoint files. Save the file as PDF in PowerPoint (or Google Slides) and import the PDF instead.' }; exit 2 }
        # Microsoft 365 PowerPoint can't write into AppData\Roaming (it says the folder doesn't exist), and opening the
        # original could clash with the same file open in PowerPoint or one Windows marked as downloaded. So PowerPoint
        # works on a copy in the temp folder, and the slides are moved into place afterwards.
        $work = Join-Path ([IO.Path]::GetTempPath()) ('whq-slides-' + [guid]::NewGuid().ToString('N'))
        $exportDir = Join-Path $work 'slides'
        New-Item -ItemType Directory -Force -Path $exportDir | Out-Null
        $copy = Join-Path $work ('deck' + $ext)
        Copy-Item -LiteralPath $Source -Destination $copy -Force
        Unblock-File -LiteralPath $copy -ErrorAction SilentlyContinue
        try {
            # Open read-only, without a window.
            $pres = $ppt.Presentations.Open($copy, -1, 0, 0)
            $count = $pres.Slides.Count
            $pres.Export($exportDir, 'PNG', 1920, 1080)
            $pres.Close()
        }
        finally {
            if ($ppt.Presentations.Count -eq 0) { $ppt.Quit() }
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
        }
        $files = Get-ChildItem -LiteralPath $exportDir -Filter '*.png' | Sort-Object { [int]($_.BaseName -replace '\D', '') }
        $n = 0
        foreach ($f in $files) {
            $n++
            $dest = Join-Path $OutDir ('slide-{0:D3}.png' -f $n)
            Move-Item -LiteralPath $f.FullName -Destination $dest -Force
            Send-Msg @{ type = 'slide'; path = $dest }
        }
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
        if ($n -eq 0) { Send-Msg @{ type = 'error'; message = 'PowerPoint opened the file but made no slide pictures. Try saving it as PDF in PowerPoint and importing the PDF.' }; exit 4 }
        Send-Msg @{ type = 'done'; count = $count }
    }
    else {
        Send-Msg @{ type = 'error'; message = 'Choose a PowerPoint (.pptx, .ppt) or PDF file.' }
        exit 1
    }
}
catch {
    Send-Msg @{ type = 'error'; message = "Couldn't import this file: $($_.Exception.Message)" }
    exit 3
}
