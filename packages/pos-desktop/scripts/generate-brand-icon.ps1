$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageDir = Resolve-Path (Join-Path $scriptDir '..')
$buildDir = Join-Path $packageDir 'build'
$pngPath = Join-Path $buildDir 'icon.png'
$icoPath = Join-Path $buildDir 'icon.ico'

if (!(Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))

$rect = New-Object System.Drawing.Rectangle 18, 18, 220, 220
$backgroundBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))
$graphics.FillEllipse($backgroundBrush, $rect)

$outlinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(147, 197, 253), 5)
$graphics.DrawEllipse($outlinePen, $rect)

$font = New-Object System.Drawing.Font('Segoe UI', 128, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(241, 245, 249))
$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$drawRect = New-Object System.Drawing.RectangleF 0, 6, $size, $size
$graphics.DrawString('M', $font, $textBrush, $drawRect, $stringFormat)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$iconHandle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()

$icon.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$backgroundBrush.Dispose()
$outlinePen.Dispose()
$font.Dispose()
$textBrush.Dispose()
$stringFormat.Dispose()
$drawRect = $null

Write-Host "Brand icon generated:"
Write-Host " - $pngPath"
Write-Host " - $icoPath"
