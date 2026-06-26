import { useCallback } from 'react';

export function useChapterTransition() {
  // 占位 hook，翻章逻辑已内联到 Reader.tsx 实现同步缓存读取
  return { goNext: undefined, goPrev: undefined, goToChapter: undefined } as any;
}
