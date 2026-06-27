import { useRef, useCallback } from 'react';

type WheelState = 'idle' | 'accumulating' | 'animating';

const THRESHOLD = 120;
const ANIMATION_DURATION = 30;

export function useWheelHandler() {
  const stateRef = useRef<WheelState>('idle');
  const accumRef = useRef(0);
  const directionRef = useRef<'prev' | 'next' | null>(null);
  const animTimerRef = useRef<number>(0);

  const onWheel = useCallback((
    e: React.WheelEvent,
    currentChapter: number,
    chaptersLength: number,
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    containerEl: HTMLElement | null,
    goNext: () => void,
    goPrev: () => void,
  ) => {
    // animating 状态忽略滚轮
    if (stateRef.current === 'animating') return;

    const isAtTop = scrollTop <= 20;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 60;
    const delta = Math.abs(e.deltaY);

    if (e.deltaY < 0 && isAtTop && currentChapter > 0) {
      // 向上滚到顶 → 前一章
      directionRef.current = 'prev';
      accumRef.current += delta;
      if (accumRef.current >= THRESHOLD) {
        stateRef.current = 'animating';
        accumRef.current = 0;
        // 动画：平移+淡出
        if (containerEl) {
          containerEl.style.transition = 'transform 0.03s ease';
          containerEl.style.transform = 'translateY(60px)';
        }
        clearTimeout(animTimerRef.current);
        animTimerRef.current = window.setTimeout(() => {
          if (containerEl) {
            containerEl.style.transition = 'none';
            containerEl.style.transform = '';
          }
          stateRef.current = 'idle';
          goPrev();
        }, ANIMATION_DURATION);
      }
    } else if (e.deltaY > 0 && isAtBottom && currentChapter < chaptersLength - 1) {
      // 向下滚到底 → 下一章
      directionRef.current = 'next';
      accumRef.current += delta;
      if (accumRef.current >= THRESHOLD) {
        stateRef.current = 'animating';
        accumRef.current = 0;
        if (containerEl) {
          containerEl.style.transition = 'transform 0.03s ease';
          containerEl.style.transform = 'translateY(-60px)';
        }
        clearTimeout(animTimerRef.current);
        animTimerRef.current = window.setTimeout(() => {
          if (containerEl) {
            containerEl.style.transition = 'none';
            containerEl.style.transform = '';
          }
          stateRef.current = 'idle';
          goNext();
        }, ANIMATION_DURATION);
      }
    } else {
      // 不在边界，重置累积
      accumRef.current = 0;
      directionRef.current = null;
    }
  }, []);

  // 重置状态（章节切换时调用）
  const resetWheel = useCallback(() => {
    stateRef.current = 'idle';
    accumRef.current = 0;
    directionRef.current = null;
    clearTimeout(animTimerRef.current);
  }, []);

  return { onWheel, resetWheel };
}
