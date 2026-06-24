param(
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageDir = Resolve-Path (Join-Path $scriptDir '..')
$releaseDir = Join-Path $packageDir 'release'

if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
  $latest = Get-ChildItem -Path $releaseDir -Filter *-setup.exe |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -eq $latest) {
    Write-Error "No setup exe found under: $releaseDir"
    exit 1
  }
  $InstallerPath = $latest.FullName
}

if (-not (Test-Path $InstallerPath)) {
  Write-Error "Installer not found: $InstallerPath"
  exit 1
}

$signature = Get-AuthenticodeSignature -FilePath $InstallerPath
if ($signature.Status -ne 'Valid') {
  Write-Error "Signature validation failed for $InstallerPath. Status: $($signature.Status)"
  exit 1
}

if ($null -eq $signature.TimeStamperCertificate) {
  Write-Error "Timestamp certificate is missing. SmartScreen reputation may degrade without timestamp."
  exit 1
}

Write-Host "Signature verification passed: $InstallerPath"
Write-Host "Signer: $($signature.SignerCertificate.Subject)"
Write-Host "Timestamp: $($signature.TimeStamperCertificate.Subject)"
