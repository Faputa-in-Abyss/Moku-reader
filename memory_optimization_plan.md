# 内存优化实施计划

## 目标
解决墨读小说阅读器内存占用超过6GB的问题，针对已诊断的4个根源进行优化。

## 任务列表

### 任务 1：`Book.content` 全路径清空保护
**文件**: `src-tauri/src/lib.rs`
**原因**: `import_book` 和 `save_online_book` 存库时已清空 content，但 `scan_library` 后台线程中 `import_book_from_path` → `l.books.push(book)` 时 content 仍带在内存中（虽然 `save_library` 会 stripping，`l` 出作用域释放，但扫描多本时存在临时内存尖峰）。
**改动**:
- `import_book_from_path` 改为返回 content 空的 Book，frontend 需要的 content 由调用方决定
- 或：scan_library 里 push 前清空 content
**方案**: 采用方案二，侵入最小。在 `scan_library` 的 `import_book_from_path` 调用后、push 前清空 content。

### 任务 2：Cover 弃用 base64 IPC，改用 convertFileSrc
**文件**: 
- `src-tauri/src/comic.rs` (新增 `get_cover_path` command)
- `src-tauri/src/lib.rs` (注册 command)
- `src/components/MangaLibrary.tsx` (改前端调用)
**原因**: `get_comic_thumbnail` 返回整个第一页的 base64（3-5MB/张），前端 coverCache 存 100 张可达 300MB。
**方案**:
- 后端新增 `get_cover_path(comicId)` command，返回 `{image_dir, filename}` 路径信息
- 前端用 `convertFileSrc(image_dir + "\\" + filename)` 生成 asset:// URL
- coverCache 存的从 base64 字符串改为轻量的 URL 字符串
- `get_page_base64` 保留不动（它还被 `get_comic_page` 调用，但 `get_comic_page` 是阅读器内单页加载，不缓存）

### 任务 3：sysinfo::System::new_all() → new()
**文件**: `src-tauri/src/lib.rs` (行 1207)
**原因**: `System::new_all()` 在 Windows 上加载数千个进程的全部信息，可以吃掉 500MB-2GB 内存。
**改动**: 
- 改为 `System::new()`（只加载系统基本信息如内存/CPU，不加载进程列表）
- 进程内存通过 `System::new()` 创建后，`refresh_processes(Some(&[pid]))` 按需加载当前进程
- 移除 `LAST_SYS` OnceLock 缓存？不，保留缓存避免多次 `new()`，只改构造参数

### 任务 4：mutool 子进程失败时清理
**文件**: `src-tauri/src/comic.rs` (行 250-268)
**原因**: `render_single_page` 用 `Command::new().output()`，该函数会等待进程完成，所以正常不会有孤儿进程。但如果 mutool 启动后挂起、或者中途崩溃且 `.wait()` 未正常回收，仍可能残留。
**改动**: 
- 将 `output()` 改为 `spawn()` + 手动管理，设置超时
- 失败分支显式 `kill()` 子进程
- **简化方案**: 因为 `output()` 已经 wait，实际没太大必要。但可以在 spawn 后加 timeout 防止 mutool 死锁。更简单的做法：在 `render_single_page` 失败时加一条进程清理日志，确认没有残留后略过。

### 依赖关系
1. 任务 3 最简单，无依赖
2. 任务 1 次之，只改 lib.rs
3. 任务 4 只改 comic.rs
4. 任务 2 涉及前后端，最复杂，需要后做

**执行顺序**: 3 → 1 → 4 → 2
（从最简到最繁，先验证能编译再逐步推进）
