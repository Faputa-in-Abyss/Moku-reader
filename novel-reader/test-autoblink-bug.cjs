/**
 * 验证 autoFlipInterval 缺失导致闪烁翻页的根因及修复方案
 *
 * 模拟：Reader.tsx 从 store 解构 autoFlipInterval
 * - d73704f Reader 版有 const autoFlipInterval = useStore((s) => s.autoFlipInterval)
 * - 新版 store.ts 没有 autoFlipInterval 字段
 * - 导致 autoFlipInterval = undefined
 * -  guard: if (autoFlipInterval <= 0) return;
 * -  undefined <= 0 → false → guard 没拦住
 * -  setInterval(nextPage, undefined * 1000) → setInterval(nextPage, NaN)
 * -  NaN 作为间隔 ≈ 0ms → 疯狂翻页 = 闪烁
 */

function simulate() {
  // 模拟 autoFlipInterval 缺失的情况
  const autoFlipInterval = undefined;

  console.log('=== Bug 复现 ===');
  console.log('autoFlipInterval:', autoFlipInterval);
  console.log('undefined <= 0:', autoFlipInterval <= 0);
  console.log('NaN * 1000:', autoFlipInterval * 1000);
  console.log('→ guard 没拦住，setInterval(nextPage, NaN) 疯狂翻页');

  // 方案A：store.ts 加默认值
  console.log('\n=== 方案A：store.ts 加默认值 0 ===');
  const autoFlipIntervalFixed = 0;
  console.log('autoFlipInterval:', autoFlipIntervalFixed);
  console.log('0 <= 0:', autoFlipIntervalFixed <= 0);
  console.log('→ guard 正常拦住，不翻页 ✓');

  // 方案B：Reader.tsx 加防御
  console.log('\n=== 方案B：Reader.tsx 加防御 ===');
  const autoFlipIntervalOrig = undefined;
  console.log('autoFlipInterval:', autoFlipIntervalOrig);
  console.log('!autoFlipInterval:', !autoFlipIntervalOrig);
  console.log('→ if (!autoFlipInterval) return; 也能拦住 ✓');
}

simulate();
