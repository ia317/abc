param(
    [string]$Message = "Auto commit $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

Write-Host "Staging all changes..."
git add -A

Write-Host "Committing with message: $Message"
git commit -m "$Message"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Pushing to remote..."
    git push origin HEAD
} else {
    Write-Host "Nothing to commit or commit failed."
}
