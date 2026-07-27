param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
  [string]$BackupRoot = "",
  [switch]$SendAlert
)

$ErrorActionPreference = "Stop"
if (-not $BackupRoot) {
  $homeBackup = Join-Path $HOME "culturepeople-backups"
  $BackupRoot = if (Test-Path $homeBackup) { $homeBackup } else { Join-Path $RepoPath "culturepeople-backups" }
}
Set-Location $RepoPath
$arguments = @("backup:health:notify", "--", "--root", $BackupRoot, "--strict")
if ($SendAlert) { $arguments += @("--apply", "--confirm", "SEND_BACKUP_HEALTH_ALERT") }
& pnpm @arguments
exit $LASTEXITCODE
