@echo off
chcp 65001 >nul
title 墨读 - 安装包构建
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "VERSION="
for /f "tokens=2 delims=:," %%a in ('findstr "version" "%ROOT%src-tauri\tauri.conf.json"') do set "VERSION=%%~a"
set "VERSION=%VERSION:"=%
set "VERSION=%VERSION: =%"

echo ============================================
echo    墨读 v%VERSION% 安装包构建
echo ============================================
echo.

echo [1/5] 检查构建环境...

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请安装: https://nodejs.org/
    pause & exit /b 1
)
echo   [OK] Node.js
call node --version

where rustc >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Rust，请安装: https://rustup.rs/
    pause & exit /b 1
)
echo   [OK] Rust
call rustc --version

where cargo >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Cargo
    pause & exit /b 1
)
echo   [OK] Cargo
echo.

echo [2/5] 清理 dist...
if exist "%ROOT%dist" (
    rmdir /s /q "%ROOT%dist"
    echo   [OK] dist 已清理
)
echo.

echo [3/5] 安装前端依赖...
cd /d "%ROOT%"
call npm install
if errorlevel 1 (
    echo [错误] npm install 失败
    pause & exit /b 1
)
echo   [OK] 前端依赖安装完成
echo.

echo [4/5] 构建前端...
call npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败
    pause & exit /b 1
)
echo   [OK] 前端构建完成
echo.

echo [5/5] 编译 Rust + 打包...
echo      首次编译约 5-15 分钟，请耐心等待...
echo.
call npm run tauri build -- --bundles nsis
if errorlevel 1 (
    echo.
    echo [错误] 构建失败，可能原因：
    echo   1. Visual Studio Build Tools 未安装或不全
    echo   2. Rust crate 下载超时（重试即可）
    echo   3. 磁盘空间不足
    echo.
    pause & exit /b 1
)
echo.

set "NSIS_DIR=%ROOT%src-tauri\target\release\bundle\nsis"
set "OUT_DIR=%ROOT%..\Download-package"

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

echo 复制安装包到 %OUT_DIR%...
set "INSTALLER=%NSIS_DIR%\墨读_%VERSION%_x64-setup.exe"
if exist "%INSTALLER%" (
    copy /Y "%INSTALLER%" "%OUT_DIR%\" >nul
    echo   [OK] %INSTALLER%
) else (
    echo   [跳过] 未找到当前版本的 NSIS 安装包
)

set "EXE_PATH=%ROOT%src-tauri\target\release\novel-reader.exe"
if exist "%EXE_PATH%" (
    copy /Y "%EXE_PATH%" "%OUT_DIR%\墨读_%VERSION%_便携版.exe" >nul
    echo   [OK] 便携版已复制
)

echo.
echo ============================================
echo    构建完成！
echo ============================================
echo.
echo   版本: %VERSION%
echo.
echo   安装包:
dir /b "%OUT_DIR%\*.exe" 2>nul
echo.
pause
