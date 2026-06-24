param(
  [Parameter(Mandatory = $false)]
  [string]$Repo,
  [switch]$Watch
)

$ErrorActionPreference = 'Stop'

$workflowFile = 'desktop-signed-release.yml'

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

Invoke-Gh workflow run $workflowFile --repo $Repo
if ($LASTEXITCODE -ne 0) {
  throw "Workflow tetiklenemedi: $workflowFile"
}

Write-Host "Workflow tetiklendi: $workflowFile"

if (-not $Watch) {
  return
}

Start-Sleep -Seconds 3
$runId = Invoke-Gh run list --repo $Repo --workflow $workflowFile --limit 1 --json databaseId --jq '.[0].databaseId'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($runId)) {
  throw 'Tetiklenen run id bulunamadi.'
}

Write-Host "Run izleniyor: $runId"
Invoke-Gh run watch $runId --repo $Repo --exit-status
if ($LASTEXITCODE -ne 0) {
  throw "Run basarisiz veya tamamlanamadi: $runId"
}
