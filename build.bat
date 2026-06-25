@echo off
chcp 65001 >nul
title Moku Reader Build
echo ============================================
echo         Moku Reader - Build
echo ============================================
echo.

:: ---------- Node.js ----------
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found, please install: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js:
node --version

:: ---------- Rust ----------
where rustc >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Rust not found, opening install page...
    start https://rustup.rs/
    echo.
    echo After installing Rust, also need WebView2:
    echo https://developer.microsoft.com/en-us/microsoft-edge/webview2/
    pause
    exit /b 1
)
echo [OK] Rust:
rustc --version

:: ---------- mutool ----------
if not exist "mutool\mutool.exe" (
    echo [WARN] mutool.exe not found in mutool\ folder
    echo        PDF comic import will NOT work
    echo        Download: https://mupdf.com/downloads/
    echo.
    echo Continuing with novel-only mode...
) else (
    echo [OK] mutool.exe ready
)

:: ---------- npm install ----------
echo.
echo [1/4] Installing frontend dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed

:: ---------- Build frontend ----------
echo.
echo [2/4] Building frontend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)
echo [OK] Frontend build complete

:: ---------- Tauri CLI ----------
echo.
echo [3/4] Checking Tauri CLI...
call npm run tauri -- --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo     Installing Tauri CLI...
    call npm install @tauri-apps/cli
)
echo [OK] Tauri CLI ready

:: ---------- Build installer ----------
echo.
echo [4/4] Building installer (may take 5-15 min)...
echo      Rust compilation in progress, please wait...
echo.
call npm run tauri build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed
    echo         Common causes:
    echo         1. Missing Visual Studio Build Tools
    echo         2. Network timeout downloading crates
    echo         3. Disk space
    echo.
    pause
    exit /b 1
)

:: ---------- Done ----------
echo.
echo ============================================
echo         BUILD SUCCESS!
echo ============================================
echo.
echo Copying outputs to root folder...
copy /Y "src-tauri\target\release\novel-reader.exe" "..\墨读.exe" 2>nul && echo [OK] novel-reader.exe -> ..\墨读.exe
copy /Y "src-tauri\target\release\bundle\nsis\*.exe" "..\" 2>nul && echo [OK] installer -> ..\

echo.
echo Installer location:
echo ..\墨读.exe
dir /b ..\墨读_*.exe 2>nul
echo.
pause
