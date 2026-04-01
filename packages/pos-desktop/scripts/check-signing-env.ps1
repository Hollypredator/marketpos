$ErrorActionPreference = 'Stop'

$hasCscLink = -not [string]::IsNullOrWhiteSpace($env:CSC_LINK)
$hasWinCscLink = -not [string]::IsNullOrWhiteSpace($env:WIN_CSC_LINK)
$hasCscName = -not [string]::IsNullOrWhiteSpace($env:CSC_NAME)
$hasCscIdentity = $hasCscLink -or $hasWinCscLink -or $hasCscName

if (-not $hasCscIdentity) {
  Write-Error "Code signing config not found. Set one of CSC_LINK, WIN_CSC_LINK or CSC_NAME."
  exit 1
}

if (($hasCscLink -or $hasWinCscLink) -and [string]::IsNullOrWhiteSpace($env:CSC_KEY_PASSWORD)) {
  Write-Error "CSC_KEY_PASSWORD is required when using CSC_LINK or WIN_CSC_LINK."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($env:CSC_TEAM_NAME) -and [string]::IsNullOrWhiteSpace($env:CSC_NAME)) {
  Write-Warning "CSC_NAME or CSC_TEAM_NAME is not set. Signtool will try best-effort cert selection."
}

Write-Host "Code signing environment check passed."
