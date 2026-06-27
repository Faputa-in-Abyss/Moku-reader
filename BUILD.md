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

构建完成后安装包输出到项目根目录下的 `Download-package/`：

```
Download-package/
├── 墨读_1.0.3_x64-setup.exe     ← NSIS 安装包
└── 墨读_v1.0.3_便携版.exe        ← 绿色便携版（解压即用）
```

> 旧版本的安装包会被自动清理，避免残留。

## 外部资源

构建时会自动检测以下目录并打包到安装包中（不存在则跳过，不报错）：

- `WordsType/to_install/` — 附加字体文件
- `mutool/` — mutool 工具（漫画 PDF 渲染）

## 手动构建

```bash
cd novel-reader
npm install                       # 安装前端依赖
npx vite build                    # 构建前端
npx @tauri-apps/cli build         # 编译 Rust + 打包（按 tauri.conf.json targets 输出）
```

## 常见问题

- **编译慢**：首次需下载 Rust crate，可设置镜像加速：
  ```
  set CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
  ```
- **linker 错误**：Visual Studio Build Tools "使用 C++ 的桌面开发"未勾选
- **"unexpected argument 'nsis'"**：不要给 `tauri build` 传 `--bundles` 参数，在 `tauri.conf.json` 的 `bundle.targets` 中配置即可
- **mutool 缺失**：漫画 PDF 渲染不可用，不影响小说阅读功能
