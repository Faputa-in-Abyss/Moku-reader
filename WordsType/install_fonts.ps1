$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$shell = New-Object -ComObject Shell.Application
$fontsFolder = $shell.NameSpace(0x14)  # CSIDL_FONTS
$count = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "        MO DU FONT INSTALLER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Collect all font files
$files = @()
Get-ChildItem "$scriptDir\*.ttf", "$scriptDir\*.otf" | ForEach-Object { $files += $_.FullName }
$toInstall = "$scriptDir\to_install"
if (Test-Path $toInstall) {
    Get-ChildItem "$toInstall\*.ttf", "$toInstall\*.otf" | ForEach-Object { $files += $_.FullName }
}

foreach ($f in $files) {
    $name = Split-Path $f -Leaf
    Write-Host "  $name" -NoNewline
    try {
        # CopyHere with 16 = no progress dialog, 1024 = no confirmation
        $fontsFolder.CopyHere($f, 16 -bor 1024)
        Write-Host " OK" -ForegroundColor Green
        $count++
    } catch {
        Write-Host " FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Done! $count fonts installed." -ForegroundColor Green
Write-Host "  Restart Mo Du to load new fonts." -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
pause
