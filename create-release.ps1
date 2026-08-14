$token = "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"
$repo = "Hollypredator/marketpos"

$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github+json"
}

# Step 1: Create release
$body = @{
    tag_name = "v1.0.1"
    name = "MarketPOS v1.0.1"
    body = "MarketPOS Masaustu Kasa Yazilimi - Kurulum Dosyasi (Guncel)"
    draft = $false
    prerelease = $false
} | ConvertTo-Json

Write-Host "Creating release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Method Post -Headers $headers -Body $body -ContentType "application/json"
Write-Host "Release created: $($release.html_url)"
Write-Host "Upload URL: $($release.upload_url)"

# Step 2: Upload asset
$uploadUrl = $release.upload_url -replace '\{.*\}', ''
$uploadUrl = "$uploadUrl`?name=MarketPOS-1.0.0-setup.exe"

$filePath = "packages\pos-desktop\release\MarketPOS-1.0.0-setup.exe"
Write-Host "Uploading $filePath to $uploadUrl ..."

$uploadHeaders = @{
    Authorization = "token $token"
    Accept = "application/vnd.github+json"
}

$fileBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $filePath))
$response = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $uploadHeaders -Body $fileBytes -ContentType "application/octet-stream"
Write-Host "Upload complete: $($response.browser_download_url)"
Write-Host "Size: $($response.size) bytes"
