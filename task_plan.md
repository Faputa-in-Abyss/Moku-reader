# 卡片长按拖拽排序 — 实施计划 ✅ 已完成

## 目标
为小说书库 (`Library.tsx`) 和漫画书库 (`MangaLibrary.tsx`) 的书籍卡片增加长按拖拽排序功能。

## 改动汇总

### 后端
- `src-tauri/src/comic.rs`: 新增 `save_comic_order` 函数（重排 comic_library.json）
- `src-tauri/src/lib.rs`: 新增 `save_comic_order` Tauri 命令 + 注册；修复了重复注册 bug

### 前端 hooks
- `src/hooks/useLongPress.ts`: 新增，800ms 长按检测
- `src/hooks/useDragSort.ts`: 新增，基于 Pointer Events 的拖拽排序

### 前端组件
- `Library.tsx`: 
  - 新增 custom 排序类型 + dragActive 状态
  - 长按 800ms 切到自定义排序模式
  - 拖拽时卡片浮起、插入位显示
  - 点击排序按钮退出自定义模式
  - Escape/点击空白退出拖拽
  - 保存新顺序到 `save_book_order`
- `MangaLibrary.tsx`:
  - 同上
  - 系列内部用 globalIdx 映射正确处理拖拽索引
  - 保存到 `save_comic_order`

### 样式
- `src/styles/global.css`: 新增 `.drag-active`, `.dragging` 样式
