# 书签 bug 修复实施计划

## 任务 1：修复单页翻页模式 bookmark offset 为0的bug

**文件**: `novel-reader/src/components/Reader.tsx`

**问题**: 单页翻页模式下，`renderSinglePage()` 中对 `pages[pageIndex]` 渲染时传了 `paragraphOffset={0}`，但 `pages[pageIndex]` 只是章节文本的字符切片（`chapterText.slice(start, end)`），段落索引从0开始编号。导致每一页都从全局段落索引0开始，书签下划线串到不应该出现的段落上。

## 任务 2：删除新增书签时导致文字重排的 paddingRight

**文件**: `novel-reader/src/components/PageRenderer.tsx`

**问题**: 第56行 `paddingRight: hasBookmark ? 28 : undefined` —— 当新增/删除书签时，paddingRight 在 0 ↔ 28 之间切换，导致段落内容宽度变化，文字换行位置改变。
