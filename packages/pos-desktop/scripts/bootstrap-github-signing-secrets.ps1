param(
  [Parameter(Mandatory = $false)]
  [string]$Repo,
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath,
  [Parameter(Mandatory = $true)]
  [string]$CertificatePassword,
  [string]$CertificateName = 'MarketPOS Team',
  [string]$TeamName = 'MarketPOS Team'
)

$ErrorActionPreference = 'Stop'

function Assert-GhCli {
  if (-not (Get-GhCommand)) {
    throw 'GitHub CLI (gh) bulunamadi. Once gh kurun: https://cli.github.com/'
  }
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

function Assert-GhAuth {
  Invoke-Gh auth status | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI login bulunamadi. Once `gh auth login` calistirin.'
  }
}

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

Assert-GhCli
Assert-GhAuth

$Repo = Resolve-Repo -ProvidedRepo $Repo
if ([string]::IsNullOrWhiteSpace($Repo)) {
  throw 'Repo parametresi zorunlu. Ornek: -Repo "OWNER/REPO" veya git remote origin tanimlayin.'
}

$resolvedPath = (Resolve-Path $CertificatePath).Path
if (-not (Test-Path $resolvedPath)) {
  throw "Sertifika dosyasi bulunamadi: $CertificatePath"
}

$bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
if ($bytes.Length -eq 0) {
  throw "Sertifika dosyasi bos: $resolvedPath"
}

$base64Certificate = [Convert]::ToBase64String($bytes)

$base64Certificate | Invoke-Gh secret set CSC_LINK --repo $Repo
$base64Certificate | Invoke-Gh secret set WIN_CSC_LINK --repo $Repo
$CertificatePassword | Invoke-Gh secret set CSC_KEY_PASSWORD --repo $Repo

if (-not [string]::IsNullOrWhiteSpace($CertificateName)) {
  $CertificateName | Invoke-Gh secret set CSC_NAME --repo $Repo
}

if (-not [string]::IsNullOrWhiteSpace($TeamName)) {
  $TeamName | Invoke-Gh secret set CSC_TEAM_NAME --repo $Repo
}

Write-Host "Signing secrets yuklendi:"
Write-Host " - CSC_LINK"
Write-Host " - WIN_CSC_LINK"
Write-Host " - CSC_KEY_PASSWORD"
Write-Host " - CSC_NAME"
Write-Host " - CSC_TEAM_NAME"
Write-Host "Repo: $Repo"
