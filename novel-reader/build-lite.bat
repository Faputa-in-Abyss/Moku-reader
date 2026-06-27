@echo off
cd /d "%~dp0"

set "VER="
for /f "tokens=2 delims=:," %%a in ('type "src-tauri\tauri.conf.json" ^| findstr "version"') do set "VER=%%~a"
set "VER=%VER:\"=%"
set "VER=%VER: =%"

set "OUT=..\Download-package"
if not exist "%OUT%" mkdir "%OUT%" 2>nul

echo ===========================================
echo   Lite build - MOKUDO v%VER%
echo   (no embedded fonts)
echo ===========================================
echo.

echo [1/4] npm install...
call npm install --no-fund --no-audit --loglevel warn
if errorlevel 1 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [2/4] vite build...
call npx vite build
if errorlevel 1 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [3/4] Tauri build...
call npx @tauri-apps/cli build
if errorlevel 1 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [4/4] Copying...
for /f %%f in ('dir /b "src-tauri\target\release\bundle\nsis\*_%VER%_x64-setup.exe" 2^>nul') do (
    copy /Y "src-tauri\target\release\bundle\nsis\%%f" "%OUT%\Moku-reader_%VER%_Lite.exe"
    echo   [OK] Lite installer
)
if exist "src-tauri\target\release\novel-reader.exe" (
    copy /Y "src-tauri\target\release\novel-reader.exe" "%OUT%\Moku-reader_%VER%_Portable.exe"
    echo   [OK] Portable exe
)
echo.
echo ===== DONE =====
echo   Output: %OUT%\
dir /b "%OUT%\*.*"
echo.
pause