/**
 * 验证书签两步法 Bug 及修复方案的独立测试脚本
 *
 * 模拟场景：
 * 1. 用户给 chapter 0 添加了一个章级书签（无 paragraphIndex）
 * 2. 用户右键给 chapter 0 的 paragraph 3 添加段落书签
 * 3. 预期：得到带 paragraphIndex=3 的书签条目
 * 4. 实际（Bug）：addBookmark 的 guard 触发，数组最后一条被错误修改
 */

// 模拟 store 状态
let bookmarks = [
  { chapterIndex: 0, chapterTitle: '第一章', timestamp: 100, paragraphIndex: undefined },
  { chapterIndex: 1, chapterTitle: '第二章', timestamp: 200, paragraphIndex: undefined },
];

// 模拟 addBookmark
function addBookmark(chapterIndex, chapterTitle) {
  // guard：该章已有章级书签就不加
  if (bookmarks.find(b => b.chapterIndex === chapterIndex && b.paragraphIndex === undefined)) {
    console.log(`  [guard] chapter ${chapterIndex} 已有章级书签，跳过`);
    return;
  }
  bookmarks = [...bookmarks, { chapterIndex, chapterTitle, timestamp: Date.now() }];
}

console.log('=== 修复前（两步法 Bug 复现）===');
console.log('初始书签:', JSON.stringify(bookmarks));

// 模拟用户对 chapter 0, paragraph 3 添加书签
const ctxParagraphIndex = 3;
const currentChapter = 0;
const snippet = '这是第一段文本预览...';

console.log(`\n用户操作：在 chapter ${currentChapter} paragraph ${ctxParagraphIndex} 添加书签`);
console.log('Step 1: addBookmark 调用...');
addBookmark(currentChapter, '第一章');

console.log('Step 2: 修改数组最后一条...');
const cur = bookmarks;
if (cur.length > 0) {
  const updated = [...cur.slice(0, -1), { ...cur[cur.length - 1], paragraphIndex: ctxParagraphIndex, textSnippet: snippet }];
  bookmarks = updated;
}

console.log('结果书签:', JSON.stringify(bookmarks));

// 验证：查找当前章节的段落书签
const curParas = new Set(bookmarks.filter(b => b.chapterIndex === currentChapter && b.paragraphIndex !== undefined).map(b => b.paragraphIndex));
console.log(`\n当前章节段落书签集合:`, [...curParas]);
console.log(`段落 ${ctxParagraphIndex} 有下划线?`, curParas.has(ctxParagraphIndex));
// 发现 Bug: paragraphIndex=3 被错误地给了 chapter 1 的最后一条！
console.log('\n⚠️ Bug: chapter 1 的书签被错误地加上了 paragraphIndex=3！');
console.log('⚠️ 当前 chapter 的 curParas Set 为空，下划线不显示！');

// ===== 修复方案验证 =====
console.log('\n\n=== 修复后（一步到位）===');
bookmarks = [
  { chapterIndex: 0, chapterTitle: '第一章', timestamp: 100, paragraphIndex: undefined },
  { chapterIndex: 1, chapterTitle: '第二章', timestamp: 200, paragraphIndex: undefined },
];

// 直接创建带 paragraphIndex 的书签，绕过 addBookmark
const newBm = {
  chapterIndex: currentChapter,
  chapterTitle: '第一章',
  timestamp: Date.now(),
  paragraphIndex: ctxParagraphIndex,
  textSnippet: snippet,
};
bookmarks = [...bookmarks, newBm];

console.log('结果书签:', JSON.stringify(bookmarks));
const curParasFixed = new Set(bookmarks.filter(b => b.chapterIndex === currentChapter && b.paragraphIndex !== undefined).map(b => b.paragraphIndex));
console.log(`\n当前章节段落书签集合:`, [...curParasFixed]);
console.log(`段落 ${ctxParagraphIndex} 有下划线?`, curParasFixed.has(ctxParagraphIndex));
console.log('✅ 修复成功！下划线正确显示');
