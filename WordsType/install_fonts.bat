@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Please run as Administrator.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d='%~dp0';$s=New-Object -ComObject Shell.Application;$f=$s.NameSpace(0x14);$c=0;gci ($d+'*.ttf'),($d+'*.otf')|%%{try{$f.CopyHere($_.FullName,16);Write-Host ('  '+$_.Name+' OK') -ForegroundColor Green;$c++}catch{Write-Host ('  '+$_.Name+' FAIL') -ForegroundColor Red}};gci ($d+'to_install\*.ttf'),($d+'to_install\*.otf')|%%{try{$f.CopyHere($_.FullName,16);Write-Host ('  '+$_.Name+' OK') -ForegroundColor Green;$c++}catch{Write-Host ('  '+$_.Name+' FAIL') -ForegroundColor Red}};Write-Host (''+$c+' fonts installed.') -ForegroundColor Green"

echo Done. Restart app to load fonts.
pause
