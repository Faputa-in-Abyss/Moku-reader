# 小说导入+读取流水线重写计划

## 根因分析
chapters 在数据流中丢失的完整链路：
1. `import_book` 返回带 chapters 的 Book → **Header.tsx 丢弃返回值**
2. `Library` 调用 `get_library` → chapters 尚在
3. `setBooks(books)` → **store.ts 把 chapters 全清空**
4. `openReader(book)` → **book.chapters = []**
5. Reader 判断 `book.chapters.length === 0` → "(没有章节内容)"

即使现在修了 setBooks，localStorage 缓存的旧数据仍然有空的 chapters。

## 重写方案
**核心策略**：前端不再信任客户端 store 中的 chapters。Reader 直接通过 IPC 向服务器请求当前书籍的最新数据。

### 改动清单

**1. Backend - `get_chapter_content` 改为取全量内容 + 切片**
保持当前逻辑不变（已正确），但增加一个辅助命令。

**2. Backend - 新增 `get_book_detail` 命令**（可选）
返回指定书的完整信息（含 chapters），不依赖客户端缓存。

**3. Frontend - Reader.tsx 重构**
- 不再依赖 `book.chapters` 
- 打开阅读器时先调 `get_library` 从后端拿最新书数据（含 chapters）
- 用后端返回的 chapters 生成目录
- 章节内容仍用 `get_chapter_content` 

**4. Frontend - store.ts 清理**
- 清空 localStorage `nr-books-meta` 中缓存的旧数据
- `setBooks` 不再清理 chapters

**5. Frontend - Header.tsx 导入后刷新**
- 导入成功后不等刷新，直接更新当前书库

## 验收标准
1. 导入 TXT 文件后立即打开 → 显示章节内容
2. 小说/漫画 Tab 切换后回小说 → 章节仍在
3. 重启应用后打开已导入的小说 → 章节内容正常
4. 在线下载的小说 → 章节内容正常
5. 没有任何 "(没有章节内容)" 的误报
