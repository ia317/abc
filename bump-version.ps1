# Bumps patch version in index.html, commits, and pushes
$file = Join-Path $PSScriptRoot "index.html"
$content = Get-Content $file -Raw

if ($content -match 'v(\d+)\.(\d+)\.(\d+)') {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3] + 1
    $newVersion = "v$major.$minor.$patch"
    $content = $content -replace 'v\d+\.\d+\.\d+', $newVersion
    Set-Content $file $content -Encoding utf8 -NoNewline
    Write-Host "Version bumped to $newVersion"

    Set-Location $PSScriptRoot
    git add index.html
    git commit -m "chore: bump to $newVersion"
    if (git remote) { git push }
}
