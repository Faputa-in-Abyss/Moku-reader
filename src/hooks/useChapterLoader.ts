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

const PREFETCH_RANGE = 2; // 预取前后各 N 章

export function useChapterLoader() {
  const bookIdRef = useRef<string | null>(null);

  // 前端缓存：章节文本 + 分页
  const textCache = useRef<Map<number, ChapterData>>(new Map());
  const paginationCache = useRef<Map<number, {pages: PageBreak[]; total_pages: number}>>(new Map());
  const configRef = useRef<PaginationConfig | null>(null);

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
    textCache.current.clear();
    paginationCache.current.clear();
  }, []);

  // 加载单章文本（走缓存）
  const loadChapterText = useCallback(async (bookId: string, chapterIdx: number): Promise<ChapterData | null> => {
    const cached = textCache.current.get(chapterIdx);
    if (cached) return cached;

    try {
      const data = await invoke<{title: string; text: string}>('get_reader_chapter', { bookId, chapterIndex: chapterIdx });
      textCache.current.set(chapterIdx, data);
      return data;
    } catch (e) {
      console.error('加载章节失败:', e);
      return null;
    }
  }, []);

  // 获取分页（走缓存）
  const loadPagination = useCallback(async (
    bookId: string, chapterIdx: number, config: PaginationConfig
  ): Promise<{pages: PageBreak[]; total_pages: number} | null> => {
    configRef.current = config;

    const cached = paginationCache.current.get(chapterIdx);
    if (cached) return cached;

    try {
      const configJson = JSON.stringify(config);
      const result = await invoke<{pages: PageBreak[]; total_pages: number}>('get_pagination', { bookId, chapterIndex: chapterIdx, config: configJson });
      paginationCache.current.set(chapterIdx, result);
      return result;
    } catch (e) {
      console.error('分页计算失败:', e);
      return null;
    }
  }, []);

  // 批量预取：给定中心章节，预取前后章节
  const prefetchRange = useCallback(async (bookId: string, centerIdx: number, totalChapters: number, config: PaginationConfig) => {
    const promises: Promise<void>[] = [];

    for (let offset = -PREFETCH_RANGE; offset <= PREFETCH_RANGE; offset++) {
      if (offset === 0) continue; // 当前章已加载
      const idx = centerIdx + offset;
      if (idx < 0 || idx >= totalChapters) continue;
      if (textCache.current.has(idx) && paginationCache.current.has(idx)) continue;

      promises.push((async () => {
        try {
          if (!textCache.current.has(idx)) {
            const data = await invoke<{title: string; text: string}>('get_reader_chapter', { bookId, chapterIndex: idx });
            textCache.current.set(idx, data);
          }
          if (!paginationCache.current.has(idx)) {
            const configJson = JSON.stringify(config);
            const result = await invoke<{pages: PageBreak[]; total_pages: number}>('get_pagination', { bookId, chapterIndex: idx, config: configJson });
            paginationCache.current.set(idx, result);
          }
        } catch { /* 预取失败不影响主流程 */ }
      })());
    }

    // 不 await，后台静默预取
    Promise.all(promises).catch(() => {});
  }, []);

  return {
    openCache, closeCache,
    loadChapterText, loadPagination,
    prefetchRange,
    textCache, paginationCache,
    bookIdRef,
  };
}
