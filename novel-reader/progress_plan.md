# 阅读进度记忆修复计划

## 根因分析（已确认）
1. **前端 `Reader.tsx` 翻页时调 `update_progress`** → 已存在（行134-146）
2. **后端 `update_progress` 更新 `book.current_chapter` + `save_library`** → 已存在（行409-422）
3. **下次打开时 `openReader(book)` 读 `book.current_chapter`** → 已存在（行169-176）
4. **进度重启后丢失的原因**：`save_library` 全量写入 `library.json` 时所有书的 content 被清空。对于**在线书**（`file_path=""`），下次启动后 content 为空且无法从文件重读 → 虽然进度（current_chapter）是保存的，但 `get_chapter_content` 在 content 为空且 file_path 为空时报错，用户看到"(读取章节失败)"。

但本地导入书不应该有这个问题——file_path 存在，可以从文件重读。

## 当前状态确认
先确认哪些环节已经生效、哪些环节有问题。

## 检查清单
- [ ] `update_progress` 调用频率：每次切章节都写 library.json？
- [ ] `save_library` 在线书 content 被清空问题
- [ ] `get_chapter_content` 对在线书的重读报错
- [ ] `openReader` 是否正确恢复了 current_chapter
