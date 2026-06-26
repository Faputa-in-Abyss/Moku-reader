import { useCallback, useRef } from 'react';
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

export interface PaginationResult {
  pages: PageBreak[];
  total_pages: number;
}

const PREFETCH_BACK = 2;
const PREFETCH_FORWARD = 4;

export function useChapterLoader() {
  const bookIdRef = useRef<string | null>(null);
  const textCache = useRef<Map<number, ChapterData>>(new Map());
  // 缓存 key 包含配置参数，不同宽度/高度/字号各自独立缓存
  const paginationCache = useRef<Map<string, PaginationResult>>(new Map());

  const openCache = useCallback(async (bookId: string) => {
    try {
      await invoke('open_book_cache', { bookId });
      bookIdRef.current = bookId;
    } catch {}
  }, []);

  const closeCache = useCallback(async () => {
    const id = bookIdRef.current;
    if (id) {
      try { await invoke('close_book_cache', { bookId: id }); } catch {}
      bookIdRef.current = null;
    }
    textCache.current.clear();
    paginationCache.current.clear();
  }, []);

  const loadChapterText = useCallback(async (bookId: string, chapterIdx: number): Promise<ChapterData | null> => {
    const cached = textCache.current.get(chapterIdx);
    if (cached) return cached;
    try {
      const data = await invoke('get_reader_chapter', { bookId, chapterIndex: chapterIdx }) as ChapterData;
      textCache.current.set(chapterIdx, data);
      return data;
    } catch (e) {
      console.error('load chapter fail:', e);
      return null;
    }
  }, []);

  const loadPagination = useCallback(async (bookId: string, chapterIdx: number, config: PaginationConfig): Promise<PaginationResult | null> => {
    const cacheKey = `${chapterIdx}-${config.font_size}-${config.container_width}-${config.container_height}-${config.double_page}`;
    const cached = paginationCache.current.get(cacheKey);
    if (cached) return cached;
    try {
      const configJson = JSON.stringify(config);
      const result = await invoke('get_pagination', { bookId, chapterIndex: chapterIdx, config: configJson }) as PaginationResult;
      paginationCache.current.set(cacheKey, result);
      return result;
    } catch (e) {
      console.error('pagination fail:', e);
      return null;
    }
  }, []);

  const prefetchRange = useCallback(async (bookId: string, centerIdx: number, totalChapters: number, config: PaginationConfig) => {
    const promises: Promise<void>[] = [];
    for (let offset = -PREFETCH_BACK; offset <= PREFETCH_FORWARD; offset++) {
      if (offset === 0) continue;
      const idx = centerIdx + offset;
      if (idx < 0 || idx >= totalChapters) continue;
      const cacheKey = `${idx}-${config.font_size}-${config.container_width}-${config.container_height}-${config.double_page}`;
      if (textCache.current.has(idx) && paginationCache.current.has(cacheKey)) continue;
      promises.push((async () => {
        try {
          if (!textCache.current.has(idx)) {
            const data = await invoke('get_reader_chapter', { bookId, chapterIndex: idx }) as ChapterData;
            textCache.current.set(idx, data);
          }
          if (!paginationCache.current.has(cacheKey)) {
            const configJson = JSON.stringify(config);
            const result = await invoke('get_pagination', { bookId, chapterIndex: idx, config: configJson }) as PaginationResult;
            paginationCache.current.set(cacheKey, result);
          }
        } catch {}
      })());
    }
    Promise.all(promises).catch(() => {});
  }, []);

  return { openCache, closeCache, loadChapterText, loadPagination, prefetchRange, textCache, paginationCache, bookIdRef };
}
