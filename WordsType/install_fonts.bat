@echo off
chcp 65001 >nul
title 墨读字体一键安装
echo ============================================
echo        墨读字体一键安装
echo ============================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 请右键 → "以管理员身份运行" 本脚本。
    pause
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"

:: 用 PowerShell 调用 Windows Shell API 安装字体
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
$scriptDir = '%SCRIPT_DIR%'; ^
$shell = New-Object -ComObject Shell.Application; ^
$fonts = $shell.NameSpace(0x14); ^
$count = 0; ^
Get-ChildItem ($scriptDir + '*.ttf'), ($scriptDir + '*.otf') ^| ForEach-Object { ^
    Write-Host ('  安装: ' + $_.Name) -NoNewline; ^
    try { $fonts.CopyHere($_.FullName, 16); Write-Host ' OK' -ForegroundColor Green; $count++ } catch { Write-Host ' FAIL' -ForegroundColor Red } ^
}; ^
$toInstall = $scriptDir + 'to_install'; ^
if (Test-Path $toInstall) { ^
    Get-ChildItem ($toInstall + '\*.ttf'), ($toInstall + '\*.otf') ^| ForEach-Object { ^
        Write-Host ('  安装: ' + $_.Name) -NoNewline; ^
        try { $fonts.CopyHere($_.FullName, 16); Write-Host ' OK' -ForegroundColor Green; $count++ } catch { Write-Host ' FAIL' -ForegroundColor Red } ^
    } ^
}; ^
Write-Host ''; ^
Write-Host ('完成！共安装 ' + $count + ' 个字体。') -ForegroundColor Green

echo.
echo 重启墨读即可看到新字体。
echo.
pause
