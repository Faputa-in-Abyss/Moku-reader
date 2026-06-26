# 小说翻页/滚轮章节跳转修复 + 滚动模式精确位置记忆

## 问题描述

### Bug: 滚动模式滚轮滚到底进入新章节跳到最后一页
**根因分析：**
1. `nextChapter()` / `prevChapter()` 只调 `setChapter(newIdx)`，没有重置 `charPosRef.current` 和 `pageIndex`
2. 新章节加载后 `pageInfo` 重新计算，[第291行 effect](https://github.com/Faputa-in-Abyss/Moku-reader/blob/main/novel-reader/src/components/Reader.tsx#L291-L298) 用旧章节残留的 `charPosRef`（旧章节最后一页的大偏移量）对齐到新的 `pageInfo`，导致跳到最后一页
3. `animateChapter()` 虽然设了 `setPageIndex(0)`，但 `setPageIndex(0)` 在 `setChapter(newIdx)` 之后，且 pageInfo 重算 effect (291行) 比 `setPageIndex(0)` 新，会覆盖掉 0

### 需求
1. 滚动模式下，章节切换（滚轮/点击目录/all）从章节第 1 页开始显示
2. 滚动模式需要**精确记忆滚动位置**（scrollTop），每次打开阅读器或切换回该章节时恢复到上次的位置
3. 位置记忆需用 localStorage，key 格式 `nr-scroll-pos-{bookId}-{chapterIndex}`

## 任务分解

### Task 1: 修复章节切换 pageIndex 跳到最后一页

**目标文件:** `novel-reader/src/components/Reader.tsx`

**具体改动：**

#### 1.1 修复 `nextChapter()` / `prevChapter()` (line 365-377)
- 切换章节前先保存当前章节的 scrollTop 到 localStorage（scroll mode）
- 调用 `setChapter()` 
- **关键改动**: 重置 `charPosRef.current = 0`
- 重置 `pageIndex = 0`（显式 setPageIndex(0)）

```typescript
const nextChapter = () => {
  const b = freshBook || book;
  if (b && b.chapters && currentChapter < b.chapters.length - 1) {
    // 先保存 scrollTop
    saveScrollPosition(currentChapter);
    charPosRef.current = 0;  // <-- 重置
    setPageIndex(0);          // <-- 重置
    setChapter(currentChapter + 1);
  }
};
```

#### 1.2 修复 `animateChapter()` (line 351-363)
- 当前 `setPageIndex(0)` 在 `setChapter(newIdx)` **之后**的 setTimeout 里调，但 291 行 effect 在 pageInfo 变化时立即执行，会覆盖
- 改为在 `setChapter(newIdx)` **之前**保存 scroll 位置 + 重置 charPosRef
```typescript
function animateChapter(newIdx: number, burstX: number, burstY: number) {
  saveScrollPosition(currentChapter);
  charPosRef.current = 0;
  setPageIndex(0);
  setFadeState("out");
  // ... rest
}
```

#### 1.3 修复 291-298 行的 pageInfo 对齐 effect
- 这个 effect 在 pageInfo 重算（比如字号变化）时用 charPosRef 恢复位置
- 需要在章节切换时让这个 effect 不起作用
- 方案：加一个 `chapterTransitionRef`，章节切换时设为 true，effect 检测到此 flag 时跳过对齐

```typescript
const chapterTransitionRef = useRef(false);

// 在 nextChapter/prevChapter/animateChapter 中:
chapterTransitionRef.current = true;

// 在 291-298 line effect 中:
useEffect(() => {
  if (chapterTransitionRef.current) {
    chapterTransitionRef.current = false;
    return;  // 章节切换时不覆盖 pageIndex
  }
  const charPos = charPosRef.current;
  let bestIdx = 0;
  for (let i = 0; i < pageInfo.length; i++) {
    if (pageInfo[i].startPos <= charPos) bestIdx = i;
  }
  setPageIndex(bestIdx);
}, [pageInfo]);
```

#### 1.4 Load effect 修复 (line 140-206)
- 当章节内容加载完成时，如果有保存的 scrollTop 就恢复 scroll，否则 scrollTo(0,0)
- 对于 page mode，如果有保存的 pageIndex 就恢复，否则 pageIndex = 0
- 明确设置 `charPosRef.current = 0` 当 page mode 时从第0页开始

**关键**: load effect 里已有保存位置恢复逻辑 (line 180-183)，但只恢复了 pageIndex，没有清空 charPosRef

### Task 2: 滚动模式精确位置记忆

#### 2.1 `saveScrollPosition(chapterIndex: number)` 工具函数
```typescript
const saveScrollPosition = (chapterIndex: number) => {
  if (!book?.id || readingMode !== "scroll") return;
  const el = contentRef.current;
  if (el) {
    localStorage.setItem(`nr-scroll-pos-${book.id}-${chapterIndex}`, String(el.scrollTop));
  }
};
```

#### 2.2 `restoreScrollPosition()` —— 在章节内容加载后恢复 scrollTop
在 load effect 中，章节文本加载后：
```typescript
if (readingMode === "scroll") {
  const savedScrollTop = localStorage.getItem(`nr-scroll-pos-${book.id}-${idx}`);
  requestAnimationFrame(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = savedScrollTop ? Number(savedScrollTop) : 0;
    }
  });
}
```

#### 2.3 定时保存 scrollTop（滚动时）
增加一个 scroll 事件监听，防抖保存：
```typescript
useEffect(() => {
  if (readingMode !== "scroll" || !book?.id) return;
  const el = contentRef.current;
  if (!el) return;
  let timer: number;
  const onScroll = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      localStorage.setItem(
        `nr-scroll-pos-${book.id}-${currentChapter}`,
        String(el.scrollTop)
      );
    }, 300);
  };
  el.addEventListener("scroll", onScroll);
  return () => {
    el.removeEventListener("scroll", onScroll);
    clearTimeout(timer);
  };
}, [readingMode, book?.id, currentChapter]);
```

### Task 3: 死代码修复 + 验证

#### 3.1 Load effect 死代码
Line 194-204 在 `return` 之后，永远不会执行。这些代码原本意图：
- `scrollLockRef.current = true; lastScrollTopRef.current = 0; ...`
  
滚动模式章节切换的清理工作，应该移到 `return () => { cancelled = true; }` **之前**：
```typescript
useEffect(() => {
  // ... cleanup before chapter transition
  scrollLockRef.current = true;
  lastScrollTopRef.current = 0;
  prevWheelAccumRef.current = 0;
  nextWheelAccumRef.current = 0;
  const scrollTimer = setTimeout(() => {
    scrollLockRef.current = false;
    lastScrollTopRef.current = 0;
  }, 600);

  let cancelled = false;
  async function loadAll() { ... }

  loadAll();
  return () => {
    cancelled = true;
    clearTimeout(scrollTimer);
  };
}, [currentChapter]);
```

#### 3.2 验证检查
- `cargo check` 无报错（如果项目需要构建）
- 或者 TypeScript 编译检查 `npx tsc --noEmit`
- 手动验证：scroll mode 下滚轮到底自动跳章 → 新章从顶部开始
- 手动验证：双击侧栏章节跳转 → 新章从顶部开始
- 手动验证：滚动模式下某个位置刷新 → 恢复上次 scrollTop
- 手动验证：page mode 下翻页到新章 → pageIndex = 0，不跳到末尾

## 依赖关系
- Task 1 和 Task 2 可以**并行**（改动不同区域，但都有文件冲突风险）
- 建议**顺序执行**：先 Task 1（修复核心 bug）→ 再 Task 2（增强位置记忆）→ 再 Task 3

## 全局约束
- 不能修改 git 文件
- 修改只能用 Edit 工具，不能用 Write 覆盖整个文件
- 修完后提醒用户 git commit
