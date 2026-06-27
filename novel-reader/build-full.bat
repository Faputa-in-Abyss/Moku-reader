@echo off
cd /d "%~dp0"

set "VER="
for /f "tokens=2 delims=:," %%a in ('type "src-tauri\tauri.conf.json" ^| findstr "version"') do set "VER=%%~a"
set "VER=%VER:\"=%"
set "VER=%VER: =%"

set "OUT=..\Download-package"
if not exist "%OUT%" mkdir "%OUT%" 2>nul

echo ===========================================
echo   Full build - MOKUDO v%VER%
echo   (with embedded Chinese fonts)
echo ===========================================
echo.

echo [1/5] npm install...
call npm install --no-fund --no-audit --loglevel warn
if errorlevel 1 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [2/5] vite build...
call npx vite build
if errorlevel 1 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [3/5] Adding fonts to config...
powershell -NoProfile -Command "$c=gc 'src-tauri\tauri.conf.json' -Raw;$c=$c-replace'\"\.\./mutool/\": \"mutool/\"','\"../mutool/\": \"mutool/\",\"../../WordsType/to_install/\": \"fonts/\"';sc 'src-tauri\tauri.conf.json' -NoNewline -Value $c"
echo OK

echo [4/5] Tauri build...
call npx @tauri-apps/cli build
if errorlevel 1 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [5/5] Restoring config + copying...
powershell -NoProfile -Command "$c=gc 'src-tauri\tauri.conf.json' -Raw;$c=$c-replace',\"../../WordsType/to_install/\": \"fonts/\"','';sc 'src-tauri\tauri.conf.json' -NoNewline -Value $c"

for /f %%f in ('dir /b "src-tauri\target\release\bundle\nsis\*_%VER%_x64-setup.exe" 2^>nul') do (
    copy /Y "src-tauri\target\release\bundle\nsis\%%f" "%OUT%\Moku-reader_%VER%_Full.exe"
    echo   [OK] Full installer
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