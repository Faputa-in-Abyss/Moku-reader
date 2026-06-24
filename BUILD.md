# 墨读阅读器 - 构建指南

## 前置条件

| 软件 | 下载地址 | 说明 |
|------|----------|------|
| **Node.js** (≥18) | https://nodejs.org/ | 前端构建 |
| **Rust** | https://rustup.rs/ | 安装后运行 `rustup default stable` |
| **Visual Studio Build Tools** | https://visualstudio.microsoft.com/visual-cpp-build-tools/ | 安装时勾选"使用 C++ 的桌面开发" |
| **WebView2** | Win10 1703+ 自带，如无：https://developer.microsoft.com/webview2/ | Tauri 运行环境 |
| **mutool** (可选) | https://mupdf.com/downloads/ | 漫画 PDF 渲染，下载后放入 `mutool/` |

## 一键构建

**双击** `build.bat`，等待完成即可。

构建完成后安装包在：
```
src-tauri\target\release\bundle\msi\    ← .msi 安装包
src-tauri\target\release\bundle\nsis\   ← .exe 安装包
```

## 手动构建

```bash
npm install          # 安装前端依赖
npm run build        # 构建前端
npm run tauri build  # 构建安装包
```

## 输出说明

| 格式 | 位置 | 说明 |
|------|------|------|
| `.msi` | `bundle/msi/` | Windows Installer，推荐 |
| `.exe` (NSIS) | `bundle/nsis/` | 轻量安装程序 |
| 便携版 | `bundle/msi/` 中提取 | 解压即用 |

## 问题排查

- **构建时下载 crates 慢**：设置 Rust 镜像 `set CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse`
- **WebView2 错误**：安装 WebView2 运行时
- **mutool 找不到**：漫画 PDF 导入会报错，不影响小说阅读功能
