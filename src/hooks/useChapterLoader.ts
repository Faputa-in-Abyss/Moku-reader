import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface PageBreak {
  page_index: number;
  start_char: number;
  end_char: number;
}

export interface PaginationConfig {
  font_size: number;
  line_height: number;
  container_width: number;
  container_height: number;
  double_page: boolean;
}

export interface ChapterData {
  title: string;
  text: string;
}

export function useChapterLoader() {
  // 缓存已打开的 book.id
  const bookIdRef = useRef<string | null>(null);

  const openCache = useCallback(async (bookId: string) => {
    try {
      await invoke('open_book_cache', { bookId });
      bookIdRef.current = bookId;
    } catch (e) {
      console.error('打开书籍缓存失败:', e);
    }
  }, []);

  const closeCache = useCallback(async () => {
    const id = bookIdRef.current;
    if (id) {
      try { await invoke('close_book_cache', { bookId: id }); } catch {}
      bookIdRef.current = null;
    }
  }, []);

  const loadChapterText = useCallback(async (bookId: string, chapterIdx: number): Promise<ChapterData | null> => {
    try {
      return await invoke<{title: string; text: string}>('get_reader_chapter', { bookId, chapterIndex: chapterIdx });
    } catch (e) {
      console.error('加载章节失败:', e);
      return null;
    }
  }, []);

  const loadPagination = useCallback(async (
    bookId: string, chapterIdx: number, config: PaginationConfig
  ): Promise<{pages: PageBreak[]; total_pages: number} | null> => {
    try {
      const configJson = JSON.stringify(config);
      return await invoke('get_pagination', { bookId, chapterIndex: chapterIdx, config: configJson });
    } catch (e) {
      console.error('分页计算失败:', e);
      return null;
    }
  }, []);

  return { openCache, closeCache, loadChapterText, loadPagination, bookIdRef };
}
