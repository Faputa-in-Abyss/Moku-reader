import { useState, useCallback, useRef } from 'react';

export type FadeState = 'visible' | 'fading-out' | 'fading-in';

export function useChapterTransition(chaptersLength: number, currentChapter: number, setChapter: (idx: number) => void) {
  const [fadeState, setFadeState] = useState<FadeState>('visible');
  const timerRef = useRef<number>(0);

  const goNext = useCallback(() => {
    if (currentChapter >= chaptersLength - 1) return;
    setFadeState('fading-out');
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setChapter(currentChapter + 1);
      setFadeState('fading-in');
      timerRef.current = window.setTimeout(() => {
        setFadeState('visible');
      }, 200);
    }, 200);
  }, [chaptersLength, currentChapter, setChapter]);

  const goPrev = useCallback(() => {
    if (currentChapter <= 0) return;
    setFadeState('fading-out');
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setChapter(currentChapter - 1);
      setFadeState('fading-in');
      timerRef.current = window.setTimeout(() => {
        setFadeState('visible');
      }, 200);
    }, 200);
  }, [currentChapter, setChapter]);

  // 直接跳转到指定章节（例如目录选择）
  const goToChapter = useCallback((idx: number) => {
    if (idx < 0 || idx >= chaptersLength) return;
    setFadeState('fading-out');
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setChapter(idx);
      setFadeState('fading-in');
      timerRef.current = window.setTimeout(() => {
        setFadeState('visible');
      }, 200);
    }, 200);
  }, [chaptersLength, setChapter]);

  return { fadeState, goNext, goPrev, goToChapter };
}
