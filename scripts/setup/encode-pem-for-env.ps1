# Reads a GitHub App .pem file and prints a single-line value for .env (GITHUB_APP_PRIVATE_KEY).
param(
  [Parameter(Mandatory = $true)]
  [string]$PemPath
)

if (-not (Test-Path $PemPath)) {
  Write-Error "File not found: $PemPath"
  exit 1
}

$lines = Get-Content $PemPath | ForEach-Object { $_.TrimEnd("`r") }
$escaped = ($lines | ForEach-Object { $_ -replace '\\', '\\\\' }) -join '\n'
Write-Output ""
Write-Output "# Add to .env:"
Write-Output "GITHUB_APP_PRIVATE_KEY=`"$escaped`""
Write-Output ""
