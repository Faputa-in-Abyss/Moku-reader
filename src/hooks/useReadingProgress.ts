import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY_PREFIX = 'nr-pos-';

export interface ReadingPosition {
  chapterIndex: number;
  charOffset: number;
  pageIndex: number;
  scrollOffset: number;
  updatedAt: number;
}

export function useReadingProgress(bookId: string | undefined) {
  const saveTimer = useRef<number>(0);
  const positionRef = useRef<ReadingPosition | null>(null);

  // 恢复位置：从 localStorage 读取指定章节的位置
  const restorePosition = useCallback((chapterIndex: number): ReadingPosition | null => {
    if (!bookId) return null;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${bookId}-${chapterIndex}`);
      if (raw) return JSON.parse(raw) as ReadingPosition;
    } catch {}
    return null;
  }, [bookId]);

  // 保存位置：带 debounce 写入 localStorage + 后端
  const savePosition = useCallback((pos: Omit<ReadingPosition, 'updatedAt'>) => {
    positionRef.current = { ...pos, updatedAt: Date.now() };

    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (!bookId || !positionRef.current) return;

      // localStorage（按章节存储，让后退回上一章也能恢复位置）
      const key = `${STORAGE_KEY_PREFIX}${bookId}-${positionRef.current.chapterIndex}`;
      localStorage.setItem(key, JSON.stringify(positionRef.current));

      // 后端
      invoke('save_reading_position', {
        bookId,
        chapterIndex: positionRef.current.chapterIndex,
        charOffset: positionRef.current.charOffset,
        pageIndex: positionRef.current.pageIndex,
        scrollOffset: positionRef.current.scrollOffset,
      }).catch(() => {});
    }, 500);
  }, [bookId]);

  // 立即保存（关闭阅读器时）
  const saveNow = useCallback(() => {
    clearTimeout(saveTimer.current);
    if (!bookId || !positionRef.current) return;

    const key = `${STORAGE_KEY_PREFIX}${bookId}-${positionRef.current.chapterIndex}`;
    localStorage.setItem(key, JSON.stringify(positionRef.current));

    invoke('save_reading_position', {
      bookId,
      chapterIndex: positionRef.current.chapterIndex,
      charOffset: positionRef.current.charOffset,
      pageIndex: positionRef.current.pageIndex,
      scrollOffset: positionRef.current.scrollOffset,
    }).catch(() => {});

    invoke('update_progress', {
      bookId,
      chapterIndex: positionRef.current.chapterIndex,
    }).catch(() => {});
  }, [bookId]);

  // 清理
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
    };
  }, []);

  return { restorePosition, savePosition, saveNow, positionRef };
}
