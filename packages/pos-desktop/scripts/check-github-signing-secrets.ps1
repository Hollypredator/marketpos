param(
  [Parameter(Mandatory = $false)]
  [string]$Repo
)

$ErrorActionPreference = 'Stop'

$requiredSecrets = @(
  'CSC_LINK',
  'WIN_CSC_LINK',
  'CSC_KEY_PASSWORD'
)

function Resolve-Repo {
  param([string]$ProvidedRepo)

  if (-not [string]::IsNullOrWhiteSpace($ProvidedRepo)) {
    return $ProvidedRepo
  }

  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_REPOSITORY)) {
    return $env:GITHUB_REPOSITORY
  }

  $remoteUrl = git config --get remote.origin.url 2>$null
  if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
    return $null
  }

  $normalized = $remoteUrl.Trim()
  if ($normalized -match 'github\.com[:/](?<repo>[^/]+/[^/]+?)(\.git)?$') {
    return $Matches['repo']
  }

  return $null
}

$Repo = Resolve-Repo -ProvidedRepo $Repo
if ([string]::IsNullOrWhiteSpace($Repo)) {
  throw 'Repo parametresi zorunlu. Ornek: -Repo "OWNER/REPO" veya git remote origin tanimlayin.'
}

function Get-GhCommand {
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if ($gh) {
    return $gh.Source
  }

  $fallback = 'C:\Program Files\GitHub CLI\gh.exe'
  if (Test-Path $fallback) {
    return $fallback
  }
  return $null
}

function Invoke-Gh {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $ghCommand = Get-GhCommand
  if (-not $ghCommand) {
    throw 'GitHub CLI (gh) bulunamadi.'
  }
  & $ghCommand @Args
}

$secretNames = Invoke-Gh secret list --repo $Repo --json name --jq ".[].name"
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub secrets listesi alinamadi. `gh auth login` durumunu kontrol edin.'
}

$existing = @($secretNames -split "`r?`n" | Where-Object { $_ -and $_.Trim().Length -gt 0 })
$missing = @()
foreach ($secret in $requiredSecrets) {
  if (-not ($existing -contains $secret)) {
    $missing += $secret
  }
}

if ($missing.Count -gt 0) {
  Write-Error "Eksik signing secret(ler): $($missing -join ', ')"
  exit 1
}

Write-Host "Signing secret kontrolu basarili."
Write-Host "Mevcut secret sayisi: $($existing.Count)"
