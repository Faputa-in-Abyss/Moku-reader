# 墨读 - 构建指南

## 前置条件

| 软件 | 下载地址 | 说明 |
|------|----------|------|
| **Node.js** (≥18) | https://nodejs.org/ | 前端构建 |
| **Rust** | https://rustup.rs/ | 运行时 `rustup default stable` |
| **Visual Studio Build Tools** | https://visualstudio.microsoft.com/visual-cpp-build-tools/ | 安装时勾选"使用 C++ 的桌面开发" |

## 一键构建

双击 `build.bat`，等待完成。

> 构建脚本会自动：清理 → 安装依赖 → 构建前端 → 编译后端 → 打包 NSIS 安装包

## 输出产物

构建完成后安装包输出到 `../Download-package/`（即项目上一级目录的 Download-package 文件夹）：

```
../Download-package/
├── 墨读_1.0.3_x64-setup.exe     ← NSIS 安装包
└── 墨读_v1.0.3_便携版.exe        ← 绿色便携版（解压即用）
```

## 单独步骤（调试用）

```bash
npm install          # 安装前端依赖
npm run build        # 构建前端
npm run tauri build  # 编译 Rust + 打包
npm run tauri build -- --bundles nsis  # 仅 NSIS 安装包
```

## 常见问题

- **编译慢**：首次需下载 Rust crate，可设置镜像加速：
  ```
  set CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
  ```
- **linker 错误**：Visual Studio Build Tools "使用 C++ 的桌面开发"未勾选
- **mutool 缺失**：漫画 PDF 渲染不可用，不影响小说功能
