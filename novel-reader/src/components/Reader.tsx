import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useStore } from '../store';
import SidebarHandle from './SidebarHandle';
import WindowControls from './WindowControls';
import { ContextMenu, GearIcon, MenuDivider, MenuItem, topbarGlassStyle, BackButton } from './SharedUI';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useChapterLoader } from '../hooks/useChapterLoader';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useWheelHandler } from '../hooks/useWheelHandler';
import { useChapterTransition } from '../hooks/useChapterTransition';
import { useReaderKeyboard } from '../hooks/useReaderKeyboard';
import PageRenderer from './PageRenderer';
import ChapterList from './ChapterList';
import { BookmarkIcon, LayoutIcon, TextIcon, FontIcon, PaletteIcon, BoldIcon, ChevronRightIcon, MinusIcon, PlusIcon } from './FlatIcons';

const COLOR_PRESETS = [
  '#e8ddd0', '#d4a96a', '#c0392b', '#e67e22',
  '#27ae60', '#2980b9', '#8e44ad', '#ecf0f1',
  '#bdc3c7', '#7f8c8d', '#2c3e50', '#1a1a2e',
];


function FontSearchDropdown({
  fonts,
  current,
  onSelect,
}: {
  fonts: { value: string; label: string }[];
  current: string;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = fonts.filter((f) =>
    f.label.toLowerCase().includes(search.toLowerCase())
  );
  const currentLabel =
    fonts.find((f) => f.value === current)?.label || '默认衬线';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          background: 'var(--glass-bg)',
          color: 'var(--text)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-sm)',
          padding: '7px 10px',
          fontSize: '.82rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {currentLabel}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 10,
            overflow: 'hidden',
          }}
        >
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索字体..."
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--glass-bg)',
              color: 'var(--text)',
              border: 'none',
              borderBottom: '1px solid var(--border-glass)',
              fontSize: '.8rem',
              outline: 'none',
            }}
          />
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {filtered.map((f) => (
              <div
                key={f.value}
                onClick={() => {
                  onSelect(f.value);
                  setOpen(false);
                  setSearch('');
                }}
                style={{
                  padding: '8px 10px',
                  fontSize: '.8rem',
                  color: f.value === current ? 'var(--accent)' : 'var(--text)',
                  background:
                    f.value === current
                      ? 'rgba(var(--accent-rgb),0.06)'
                      : 'transparent',
                }}
              >
                {f.label}
              </div>
            ))}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: '8px 10px',
                  fontSize: '.78rem',
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                }}
              >
                未找到匹配字体
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const FONT_LIST = [
  { value: '', label: '默认衬线' },
  { value: "'PingFang SC','Microsoft YaHei',sans-serif", label: '无衬线 (苹方/微软雅黑)' },
  { value: "'STSong','SimSun',serif", label: '宋体' },
  { value: "'KaiTi','STKaiti',serif", label: '楷体' },
  { value: "'FangSong','STFangsong',serif", label: '仿宋' },
  { value: "'Source Han Serif SC','Noto Serif CJK SC',serif", label: '思源宋体' },
  { value: "'LXGW WenKai','STKaiti',serif", label: '霞鹜文楷' },
  { value: "'ZCOOL XiaoWei','Noto Serif SC',serif", label: '站酷小魏体' },
  { value: "'ZCOOL QingKe HuangYou','PingFang SC',sans-serif", label: '站酷清刻黄油体' },
  { value: "'Ma Shan Zheng','STKaiti',serif", label: '马善政楷书' },
  { value: "'Liu Jian Mao Cao','STKaiti',cursive", label: '柳建毛草体' },
  { value: "'ZCOOL KuaiLe',sans-serif", label: '站酷快乐体' },
];

const FONT_LIST_SHORT = [
  { value: '', label: '默认衬线' },
  { value: "'PingFang SC','Microsoft YaHei',sans-serif", label: '无衬线(苹方/雅黑)' },
  { value: "'STSong','SimSun',serif", label: '宋体' },
  { value: "'KaiTi','STKaiti',serif", label: '楷体' },
  { value: "'FangSong','STFangsong',serif", label: '仿宋' },
  { value: "'Source Han Serif SC','Noto Serif CJK SC',serif", label: '思源宋体' },
  { value: "'LXGW WenKai','STKaiti',serif", label: '霞鹜文楷' },
  { value: "'ZCOOL XiaoWei','Noto Serif SC',serif", label: '站酷小魏体' },
  { value: "'ZCOOL QingKe HuangYou','PingFang SC',sans-serif", label: '站酷清刻黄油体' },
  { value: "'Ma Shan Zheng','STKaiti',serif", label: '马善政楷书' },
  { value: "'Liu Jian Mao Cao','STKaiti',cursive", label: '柳建毛草体' },
  { value: "'ZCOOL KuaiLe',sans-serif", label: '站酷快乐体' },
];

export default function Reader() {
  // ── Store ──
  const book = useStore((s) => s.currentBook);
  const currentChapter = useStore((s) => s.currentChapter);
  const setChapter = useStore((s) => s.setChapter);
  const closeReader = useStore((s) => s.closeReader);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const fontBold = useStore((s) => s.fontBold);
  const setFontBold = useStore((s) => s.setFontBold);
  const readerFont = useStore((s) => s.readerFont);
  const setReaderFont = useStore((s) => s.setReaderFont);
  const readerTextColor = useStore((s) => s.readerTextColor);
  const setReaderTextColor = useStore((s) => s.setReaderTextColor);
  const readerBgColor = useStore((s) => s.readerBgColor);
  const setReaderBgColor = useStore((s) => s.setReaderBgColor);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const readingMode = useStore((s) => s.readingMode);
  const setReadingMode = useStore((s) => s.setReadingMode);
  const keybindings = useStore((s) => s.keybindings);
  const setKeybinding = useStore((s) => s.setKeybinding);
  const windowSize = useStore((s) => s.windowSize);
  const setWindowSize = useStore((s) => s.setWindowSize);
  const bookmarks = useStore((s) => s.bookmarks);
  const addBookmark = useStore((s) => s.addBookmark);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const loadBookmarks = useStore((s) => s.loadBookmarks);
  const readerDoublePage = useStore((s) => s.readerDoublePage);
  const setReaderDoublePage = useStore((s) => s.setReaderDoublePage);

  const chapters = book?.chapters || [];

  // ── Hooks ──
  const chapterLoader = useChapterLoader();
  const readingProgress = useReadingProgress(book?.id);
  const wheelHandler = useWheelHandler();
  const transition = useChapterTransition(chapters.length, currentChapter, setChapter);

  // ── Ref ──
  const bookIdRef = useRef(book?.id);
  useEffect(() => { bookIdRef.current = book?.id; }, [book?.id]);

  // ── UI State ──
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(window.innerWidth < 420);
  const [veryNarrow, setVeryNarrow] = useState(window.innerWidth < 360);
  useEffect(() => {
    const onResize = () => {
      setNarrow(window.innerWidth < 420);
      setVeryNarrow(window.innerWidth < 360);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Window controls
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    (async () => { try { setMaximized(await win.isMaximized()); } catch {} })();
    const onResize = () => {
      (async () => { try { setMaximized(await win.isMaximized()); } catch {} })();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [win]);

  const handleMinimize = async () => { try { await win.minimize(); } catch {} };
  const handleMaximizeToggle = async () => {
    try {
      const m = await win.isMaximized();
      if (m) { await win.unmaximize(); setMaximized(false); }
      else { await win.maximize(); setMaximized(true); }
    } catch {}
  };
  const handleWindowClose = async () => { try { await win.close(); } catch {} };

  // ── Reader State ──
  const [chapterText, setChapterText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [tip, setTip] = useState('');
  const [sidebarHint, setSidebarHint] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxSubMenu, setCtxSubMenu] = useState<string | null>(null);
  const [ctxParagraphIndex, setCtxParagraphIndex] = useState<number | undefined>(undefined);

  const tipTimer = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const topbarTimer = useRef<number>(0);
  const sideTimer = useRef<number>(0);
  const sidebarOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const skipChapterLoadRef = useRef(false);

  sidebarOpenRef.current = sidebarOpen;
  settingsOpenRef.current = settingsOpen;

  const contentWidth = narrow
    ? Math.min(window.innerWidth - 32, 680)
    : ([408, 544, 680, 816, 952][windowSize] || 680);

  // 窗口 resize 自动降级单页
  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 768 && readerDoublePage) {
        setReaderDoublePage(false);
      }
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [readerDoublePage, setReaderDoublePage]);

  // 双页时 pageIndex 自动偶数
  useEffect(() => {
    if (readerDoublePage && pageIndex % 2 !== 0) {
      setPageIndex(pageIndex - 1);
    }
  }, [readerDoublePage]);

  // ── 章节加载 ──
  const saveScrollPosition = (chapterIdx: number) => {
    if (!book?.id) return;
    const el = contentRef.current;
    if (el && readingMode === 'scroll') {
      localStorage.setItem(
        `nr-scroll-pos-${book.id}-${chapterIdx}`,
        String(el.scrollTop)
      );
    }
  };

  const showTip = (msg: string) => {
    clearTimeout(tipTimer.current);
    setTip(msg);
    tipTimer.current = window.setTimeout(() => setTip(''), 3000);
  };

  useEffect(() => {
    if (!book) return;
    let cancelled = false;

    async function loadCurrentChapterData() {
      setIsLoading(true);

      // 清除旧分页数据，避免旧分页+新文本算出错误页面并闪烁
      setPageBreaks([]);
      setTotalPages(0);

      // 打开缓存（首次）
      try {
        await chapterLoader.openCache(book.id);
      } catch {
        // 可能已打开
      }

      // 加载章节文本
      const data = await chapterLoader.loadChapterText(book.id, currentChapter);
      if (cancelled) return;

      if (!data) {
        showTip('读取章节失败，请检查书籍文件');
        setChapterText('(读取章节失败)');
        setIsLoading(false);
        return;
      }

      setChapterText(data.text);

      // 分页模式：恢复位置
      if (readingMode === 'page') {
        const savedPos = readingProgress.restorePosition(currentChapter);
        if (savedPos && savedPos.chapterIndex === currentChapter) {
          setPageIndex(savedPos.pageIndex);
        } else {
          // 旧的 localStorage 兼容
          const oldPos = localStorage.getItem(
            `nr-page-pos-${book.id}-${currentChapter}`
          );
          if (oldPos && !isNaN(Number(oldPos))) {
            setPageIndex(Number(oldPos));
          } else {
            setPageIndex(0);
          }
        }
      }

      setIsLoading(false);

      // 加载完成后，后台静默预取前后章节
      if (book) {
        chapterLoader.prefetchRange(book.id, currentChapter, chapters.length, {
          font_size: fontSize,
          line_height: 2.0,
          container_width: readerDoublePage
            ? Math.floor(window.innerWidth / 2) - 18
            : contentWidth,
          container_height: window.innerHeight,
          double_page: readerDoublePage,
        });
      }
    }

    // 如果已由 switchChapter 同步填充，跳过异步加载
    if (skipChapterLoadRef.current) {
      skipChapterLoadRef.current = false;
      return;
    }

    // 章节切换时重置
    wheelHandler.resetWheel();
    contentRef.current?.scrollTo({ top: 0 });

    loadCurrentChapterData();

    if (book?.id) loadBookmarks(book.id);

    return () => {
      cancelled = true;
    };
  }, [currentChapter, book?.id]);

  // Scroll 模式：内容加载后恢复 scrollTop
  useEffect(() => {
    if (
      readingMode !== 'scroll' ||
      !book?.id ||
      !chapterText ||
      chapterText.startsWith('(')
    )
      return;
    const savedScrollTop = localStorage.getItem(
      `nr-scroll-pos-${book.id}-${currentChapter}`
    );
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = savedScrollTop
          ? Number(savedScrollTop)
          : 0;
      }
    });
  }, [chapterText, currentChapter, readingMode]);

  // Scroll 模式：滚动时防抖保存 scrollTop
  useEffect(() => {
    if (readingMode !== 'scroll' || !book?.id) return;
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
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, [readingMode, book?.id, currentChapter]);

  // 后端进度更新（阅读进度 + 章节进度）
  useEffect(() => {
    const timer = setTimeout(async () => {
      const id = bookIdRef.current;
      if (!id) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('update_progress', {
          bookId: id,
          chapterIndex: currentChapter,
        });
      } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [currentChapter]);

  // 分页数据重新加载（当前章节/窗口尺寸/字号变化时）
  useEffect(() => {
    if (readingMode !== 'page' || !book?.id || !chapterText) return;
    let cancelled = false;
    async function reloadPagination() {
      const config = {
        font_size: fontSize,
        line_height: 2.0,
        container_width: readerDoublePage
          ? Math.floor(window.innerWidth / 2) - 18
          : contentWidth,
        container_height: window.innerHeight,
        double_page: readerDoublePage,
      };
      const result = await chapterLoader.loadPagination(book.id, currentChapter, config);
      if (!cancelled && result) {
        setPageBreaks(result.pages);
        setTotalPages(result.total_pages);
      }
    }
    reloadPagination();
    return () => { cancelled = true; };
  }, [currentChapter, chapterText, fontSize, windowSize, readerDoublePage, readingMode, contentWidth]);

  // ── 保存后端分页结果 ──
  const [pageBreaks, setPageBreaks] = useState<Array<{start_char: number; end_char: number}>>([]);

  // 从后端分页结果映射为页面文本数组
  const pages = useMemo(() => {
    if (!chapterText || pageBreaks.length === 0) return [];
    return pageBreaks.map((pb) => {
      const start = Math.min(pb.start_char, chapterText.length);
      const end = Math.min(pb.end_char, chapterText.length);
      return start < end ? chapterText.slice(start, end) : '';
    });
  }, [chapterText, pageBreaks]);

  const switchChapter = useCallback((newIdx: number) => {
    // 同步从缓存取数据
    const cachedText = chapterLoader.textCache.current.get(newIdx);
    const cachedPages = chapterLoader.paginationCache.current.get(newIdx);

    if (cachedText && cachedPages) {
      // 缓存命中：一口气设所有状态，零中间态，跳过章节加载 effect
      skipChapterLoadRef.current = true;
      setChapterText(cachedText.text);
      setPageBreaks(cachedPages.pages);
      setTotalPages(cachedPages.total_pages);
      const saved = readingProgress.restorePosition(newIdx);
      setPageIndex(saved?.chapterIndex === newIdx ? saved.pageIndex : 0);
      setChapter(newIdx);
    } else {
      // 缓存未命中（预取都来不及，极低概率）：走正常异步流程
      setChapter(newIdx);
    }
  }, [chapterLoader, readingProgress, setChapter]);

  // ── 翻页 ──
  const pageStep = readingMode === 'page' && readerDoublePage ? 2 : 1;

  const nextPage = () => {
    if (
      !chapterText ||
      chapterText === '(没有章节内容)' ||
      chapterText.startsWith('(读取章节失败') ||
      chapterText === ''
    )
      return;

    if (readingMode === 'page') {
      if (pageIndex < pages.length - pageStep) {
        setPageIndex(pageIndex + pageStep);
      } else if (currentChapter < chapters.length - 1) {
        saveScrollPosition(currentChapter);
        switchChapter(currentChapter + 1);
      } else {
        showTip('已经是最后一页');
      }
    } else if (currentChapter < chapters.length - 1) {
      saveScrollPosition(currentChapter);
      switchChapter(currentChapter + 1);
    } else {
      showTip('已经是最后一章');
    }
  };

  const prevPage = () => {
    if (
      !chapterText ||
      chapterText === '(没有章节内容)' ||
      chapterText.startsWith('(读取章节失败') ||
      chapterText === ''
    )
      return;

    if (readingMode === 'page') {
      if (pageIndex > 0) {
        setPageIndex(Math.max(0, pageIndex - pageStep));
      } else if (currentChapter > 0) {
        saveScrollPosition(currentChapter);
        switchChapter(currentChapter - 1);
      } else {
        showTip('已经是第一页');
      }
    } else if (currentChapter > 0) {
      saveScrollPosition(currentChapter);
      switchChapter(currentChapter - 1);
    } else {
      showTip('已经是第一章');
    }
  };

  useReaderKeyboard(
    keybindings,
    fontSize,
    setFontSize,
    prevPage,
    nextPage,
    recordingKey
  );

  // ── 位置保存 ──
  useEffect(() => {
    if (
      !book?.id ||
      !chapterText ||
      readingMode !== 'page'
    )
      return;

    // 估算 charOffset（简化：通过 pages 长度和 pageIndex 估算）
    const charOffset =
      pages.length > 0
        ? Math.floor(
            (pageIndex / Math.max(1, pages.length)) * chapterText.length
          )
        : 0;

    readingProgress.savePosition({
      chapterIndex: currentChapter,
      charOffset,
      pageIndex,
      scrollOffset: 0,
    });
  }, [pageIndex, currentChapter, book?.id, pages]);

  // ── 关闭 ──
  const handleClose = () => {
    readingProgress.saveNow();
    chapterLoader.closeCache();
    closeReader();
  };

  // ── 滚轮处理 ──
  const handleWheel = (e: React.WheelEvent) => {
    if (
      !chapterText ||
      chapterText === '(没有章节内容)' ||
      chapterText.startsWith('(读取章节失败') ||
      chapterText === ''
    ) {
      return;
    }

    if (readingMode === 'page') {
      if (e.deltaY > 0) nextPage();
      else prevPage();
      return;
    }

    if (readingMode === 'scroll') {
      const el = contentRef.current;
      if (!el) return;

      wheelHandler.onWheel(
        e,
        currentChapter,
        chapters.length,
        el.scrollTop,
        el.scrollHeight,
        el.clientHeight,
        el,
        () => {
          saveScrollPosition(currentChapter);
          switchChapter(currentChapter + 1);
        },
        () => {
          saveScrollPosition(currentChapter);
          switchChapter(currentChapter - 1);
        }
      );
    }
  };

  // ── 鼠标移动 ──
  const handleMouseMove = (e: React.MouseEvent) => {
    clearTimeout(topbarTimer.current);
    if (narrow) return;

    if (e.clientY < 80) {
      document.querySelector('.reader-topbar')?.classList.add('visible');
    } else {
      const tb = document.querySelector('.reader-topbar');
      if (!tb) return;
      const rect = tb.getBoundingClientRect();
      if (tb.classList.contains('visible') && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        return;
      }
      topbarTimer.current = window.setTimeout(() => {
        if (!sidebarOpenRef.current && !settingsOpenRef.current) {
          document.querySelector('.reader-topbar')?.classList.remove('visible');
        }
      }, 300);
    }

    setSidebarHint(
      e.clientX >= 28 &&
        e.clientX < 100 &&
        e.clientY > 120 &&
        e.clientY < window.innerHeight - 60 &&
        !sidebarOpen &&
        !settingsOpen
    );

    if (
      e.clientX < 15 &&
      e.clientY > 120 &&
      e.clientY < window.innerHeight - 60 &&
      !sidebarOpenRef.current &&
      !settingsOpenRef.current
    ) {
      setSidebarOpen(true);
    } else if (!settingsOpenRef.current && e.clientX >= 60) {
      if (sidebarOpenRef.current) {
        if (e.clientX > 280) {
          if (!sideTimer.current) {
            sideTimer.current = window.setTimeout(() => {
              setSidebarOpen(false);
              sideTimer.current = 0;
            }, 500);
          }
        } else {
          if (sideTimer.current) {
            clearTimeout(sideTimer.current);
            sideTimer.current = 0;
          }
        }
      }
    }

    if (settingsOpenRef.current && !sidebarOpenRef.current) {
      const winW = window.innerWidth;
      if (e.clientX < winW - 300) {
        if (!sideTimer.current) {
          sideTimer.current = window.setTimeout(() => {
            setSettingsOpen(false);
            sideTimer.current = 0;
          }, 500);
        }
      } else {
        if (sideTimer.current) {
          clearTimeout(sideTimer.current);
          sideTimer.current = 0;
        }
      }
    }
  };

  const handleMouseLeave = () => {
    clearTimeout(topbarTimer.current);
    if (!sidebarOpenRef.current && !settingsOpenRef.current) {
      document.querySelector('.reader-topbar')?.classList.remove('visible');
    }
    if (sideTimer.current) {
      clearTimeout(sideTimer.current);
      sideTimer.current = 0;
    }
  };

  // ── 粒子 Canvas ──
  useEffect(() => {
    const canvas = document.getElementById(
      'reader-particle-canvas'
    ) as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    let running = true;
    const particles: any[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: 0.8 + Math.random() * 1.8,
        sx: (Math.random() - 0.5) * 0.15,
        sy: (Math.random() - 0.5) * 0.15,
        o: 0.08 + Math.random() * 0.25,
        wf: 0.005 + Math.random() * 0.015,
        wa: 0.2 + Math.random() * 0.6,
        wo: Math.random() * 6.28,
        cm: Math.random(),
      });
    }

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);

    let clr: number[] = [];
    function getClr() {
      const s = getComputedStyle(document.documentElement);
      const p = s.getPropertyValue('--accent-rgb').trim().split(',').map(Number);
      clr = p.length === 3 ? p : [184, 137, 80];
    }
    getClr();

    let time = 0;
    function animate() {
      if (!running) return;
      ctx!.clearRect(0, 0, W, H);
      time += 0.015;
      for (const p of particles) {
        const wb = Math.sin(time * p.wf + p.wo) * p.wa;
        p.sx += (Math.random() - 0.5) * 0.015;
        p.sy += (Math.random() - 0.5) * 0.015;
        p.sx *= 0.98;
        p.sy *= 0.98;
        p.x += p.sx + wb * 0.02;
        p.y += p.sy + Math.cos(time * p.wf + p.wo) * 0.1;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.s, 0, 6.28);
        ctx!.fillStyle = `rgba(${clr[0]},${clr[1]},${clr[2]},${p.o})`;
        ctx!.fill();
      }
      requestAnimationFrame(animate);
    }
    animate();

    return () => {
      running = false;
      window.removeEventListener('resize', resize);
    };
  }, []);

  // ── 清理 ──
  useEffect(() => {
    return () => {
      clearTimeout(topbarTimer.current);
      clearTimeout(tipTimer.current);
      clearTimeout(sideTimer.current);
    };
  }, []);

  // ── 渲染 ──

  const pageFontFamily =
    readerFont || "'Georgia','Noto Serif SC',serif";

  const renderLeftPage = () => {
    const p = pages[pageIndex];
    if (!p) return null;
    // 计算本页在全文段落中的起始索引
    const leftPageCharStart = pageIndex > 0 ? pageBreaks[pageIndex - 1].end_char : 0;
    const leftParaOffset = chapterText ? chapterText.slice(0, leftPageCharStart).split('\n').filter(l => l.trim()).length : 0;
    const curParas = new Set(bookmarks.filter(b => b.chapterIndex === currentChapter && b.paragraphIndex !== undefined).map(b => b.paragraphIndex));
    return (
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '36px 10px 72px 16px',
          width: '50%',
        }}
      >
        {chapters?.[currentChapter]?.title && pageIndex === 0 && (
          <div
            style={{
              textAlign: 'center',
              marginBottom: 16,
              fontSize: '.95rem',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            {chapters[currentChapter].title}
          </div>
        )}
        <PageRenderer
          text={p}
          fontSize={fontSize}
          lineHeight={2}
          fontFamily={pageFontFamily}
          fontWeight={fontBold ? 700 : 400}
          textColor={readerTextColor}
          bookmarkParagraphIndices={curParas}
          paragraphOffset={leftParaOffset}
        />
      </div>
    );
  };

  const renderRightPage = () => {
    const p = pages[pageIndex + 1];
    if (!p) return null;
    // 计算本页在全文段落中的起始索引
    const rightPageCharStart = pageBreaks[pageIndex].end_char;
    const rightParaOffset = chapterText ? chapterText.slice(0, rightPageCharStart).split('\n').filter(l => l.trim()).length : 0;
    const curParas = new Set(bookmarks.filter(b => b.chapterIndex === currentChapter && b.paragraphIndex !== undefined).map(b => b.paragraphIndex));
    return (
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '36px 16px 72px 10px',
          width: '50%',
        }}
      >
        <PageRenderer
          text={p}
          fontSize={fontSize}
          lineHeight={2}
          fontFamily={pageFontFamily}
          fontWeight={fontBold ? 700 : 400}
          textColor={readerTextColor}
          bookmarkParagraphIndices={curParas}
          paragraphOffset={rightParaOffset}
        />
      </div>
    );
  };

  const renderSinglePage = () => {
    const curParas = new Set(bookmarks.filter(b => b.chapterIndex === currentChapter && b.paragraphIndex !== undefined).map(b => b.paragraphIndex));
    return (
    <div
      ref={contentRef}
      style={{
        flex: 1,
        overflowY: readingMode === 'page' ? 'hidden' : 'auto',
        padding: '40px 16px 80px',
        maxWidth: contentWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {chapterText !== '(没有章节内容)' &&
        chapterText !== '' &&
        !chapterText.startsWith('(读取章节失败') && (
          <div
            style={{
              textAlign: 'center',
              marginBottom: 24,
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            {chapters?.[currentChapter]?.title || ''}
          </div>
        )}
      {chapterText ? (
        readingMode === 'page' ? (
          pages[pageIndex] ? (
            <PageRenderer
              text={pages[pageIndex]}
              fontSize={fontSize}
              lineHeight={2}
              fontFamily={pageFontFamily}
              fontWeight={fontBold ? 700 : 400}
              textColor={readerTextColor}
            bookmarkParagraphIndices={curParas}
            paragraphOffset={0}
            />
          ) : pageBreaks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>正在分页...</div>
          ) : null
        ) : (
          <PageRenderer
            text={chapterText}
            fontSize={fontSize}
            lineHeight={2}
            fontFamily={pageFontFamily}
            fontWeight={fontBold ? 700 : 400}
            textColor={readerTextColor}
            bookmarkParagraphIndices={curParas}
            paragraphOffset={0}
          />
        )
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-dim)',
          }}
        >
          {isLoading ? '加载中...' : ''}
        </div>
      )}
    </div>
  );
  };

  return (
    <>
      <canvas
        id="reader-particle-canvas"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 199,
          pointerEvents: 'none',
        }}
      />
      <div
        className="reader-view"
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (e.button === 2) {
            let pIdx;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const pEl = el?.closest('[data-paragraph-index]');
            if (pEl) {
              const idx = pEl.getAttribute('data-paragraph-index');
              if (idx) pIdx = parseInt(idx, 10);
            }
            setCtxParagraphIndex(pIdx);
            setCtxMenu({ x: e.clientX, y: e.clientY });
            setCtxSubMenu(null);
          }
        }}
        onTouchStart={(e) => {
          if (!narrow) return;
          const t = e.touches[0];
          touchStartRef.current = {
            x: t.clientX,
            y: t.clientY,
            time: Date.now(),
          };
        }}
        onTouchEnd={(e) => {
          if (!narrow) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStartRef.current.x;
          const dy = t.clientY - touchStartRef.current.y;
          const dt = Date.now() - touchStartRef.current.time;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          if (absDx > 30 && absDx > absDy * 1.5) {
            if (dx > 0) prevPage();
            else nextPage();
            return;
          }

          if (absDx < 15 && absDy < 15 && dt < 300) {
            const w = window.innerWidth;
            const x = t.clientX;
            if (x < w * 0.3) {
              prevPage();
            } else if (x > w * 0.7) {
              nextPage();
            } else {
              setToolbarVisible((v) => !v);
            }
          }
        }}
        style={{
          display: 'flex',
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: readerBgColor || 'var(--reader-bg)',
          flexDirection: 'column',
          opacity: 1,
          visibility: 'visible',
          transition: 'background 0.6s ease',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >
        {/* 顶部导航栏 */}
        <div
          className="reader-topbar"
          style={{
            ...topbarGlassStyle,
            ...(narrow ? { padding: '10px 12px' } : {}),
            opacity: narrow ? (toolbarVisible ? 1 : 0) : 0,
            transform: narrow
              ? toolbarVisible
                ? 'translateY(0)'
                : 'translateY(-100%)'
              : 'translateY(-100%)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          }}
          data-tauri-drag-region
        >
          <div className="light-follow" />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              position: 'relative',
              zIndex: 1,
              whiteSpace: 'nowrap',
            }}
          >
            <BackButton
              onClick={handleClose}
              label={narrow ? '←' : '← 返回书库'}
            />
            <span
              style={{
                fontFamily: 'var(--font-title)',
                fontWeight: 500,
                maxWidth: narrow ? (veryNarrow ? 0 : 120) : 240,
                opacity: veryNarrow ? 0 : 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'max-width 0.3s ease, opacity 0.3s ease',
              }}
            >
              {book?.title}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              position: 'relative',
              zIndex: 1,
              alignItems: 'center',
            }}
          >
            <button
              className="btn"
              onClick={() => {
                if (window.innerWidth < 768) {
                  showTip('窗口过窄无法开启双页模式');
                  return;
                }
                setReaderDoublePage(!readerDoublePage);
              }}
              disabled={window.innerWidth < 768}
              style={{
                fontSize: '.78rem',
                opacity: readingMode === 'page' && !narrow ? 1 : 0,
                maxWidth: readingMode === 'page' && !narrow ? 60 : 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                background: readerDoublePage
                  ? 'rgba(var(--accent-rgb),0.12)'
                  : undefined,
                borderColor: readerDoublePage
                  ? 'var(--accent)'
                  : undefined,
                transition: 'opacity 0.3s ease, max-width 0.3s ease',
              }}
            >
              {readerDoublePage ? '双页' : '单页'}
            </button>
            <button
              className="btn"
              style={{
                fontSize: '.78rem',
                opacity: narrow ? 0 : 1,
                maxWidth: narrow ? 0 : 60,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'opacity 0.3s ease, max-width 0.3s ease',
              }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              目录
            </button>
            <button
              className="btn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text)',
              }}
            >
              <GearIcon />
            </button>
            <div data-tauri-no-drag>
              <WindowControls
                onMinimize={handleMinimize}
                onMaximize={handleMaximizeToggle}
                onClose={handleWindowClose}
                maximized={maximized}
              />
            </div>
          </div>
        </div>

        {/* 正文区域 */}
        {readingMode === 'page' && readerDoublePage && chapterText && pages.length > 0 ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {renderLeftPage()}
            <div
              style={{
                width: 1,
                background: 'var(--border-glass)',
                flexShrink: 0,
              }}
            />
            {renderRightPage()}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
            }}
          >
            {renderSinglePage()}
          </div>
        )}

        {/* 侧栏把手 */}
        <SidebarHandle
          open={sidebarOpen}
          hint={sidebarHint}
          sidebarWidth={280}
          zIndex={399}
        />

        {/* 目录侧栏 */}
        <ChapterList
          chapters={chapters}
          currentChapter={currentChapter}
          bookmarks={bookmarks}
          open={sidebarOpen}
          bookId={book?.id}
          onSelect={(idx, charOffset) => {
            saveScrollPosition(currentChapter);
            switchChapter(idx);

            // 搜索结果跳转：尝试定位到匹配位置
            if (charOffset !== undefined) {
              if (readingMode === 'page') {
                // 分页模式：查找匹配字符偏移属于哪一页
                const matchPage = pageBreaks.findIndex(
                  (pb) => charOffset >= pb.start_char && charOffset < pb.end_char
                );
                if (matchPage >= 0) {
                  setPageIndex(matchPage);
                }
              } else {
                // Scroll 模式：按字符比例估算滚动位置
                const scrollToMatch = () => {
                  const el = contentRef.current;
                  if (!el) return;
                  const totalLen = chapterText.length || 1;
                  const ratio = Math.min(1, charOffset / totalLen);
                  el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
                };
                setTimeout(scrollToMatch, 100);
                setTimeout(scrollToMatch, 300);
              }
            }
          }}
          onClose={() => setSidebarOpen(false)}
          onRemoveBookmark={removeBookmark}
        />

        {/* 设置面板 */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 300,
            background: 'var(--glass-bg)',
            backdropFilter:
              'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
            borderLeft: '1px solid var(--border-glass)',
            transform: settingsOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.35s ease',
            zIndex: 400,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-glass)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>设置</span>
            <button
              className="btn"
              style={{ padding: '2px 8px', fontSize: '.7rem' }}
              onClick={() => setSettingsOpen(false)}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  color: 'var(--text-dim)',
                  fontSize: '.78rem',
                  marginBottom: 8,
                }}
              >
                <LayoutIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />阅读模式
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['page', 'scroll'].map((mode) => (
                  <button
                    key={mode}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      fontSize: '.82rem',
                      background:
                        readingMode === mode
                          ? 'rgba(var(--accent-rgb),0.12)'
                          : undefined,
                      borderColor:
                        readingMode === mode ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => setReadingMode(mode as any)}
                  >
                    {mode === 'page' ? '翻页' : '滚动'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  color: 'var(--text-dim)',
                  fontSize: '.78rem',
                  marginBottom: 8,
                }}
              >
                <TextIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />字号
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <button
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: '.7rem' }}
                  onClick={() => setFontSize(fontSize - 0.1)}
                >
                  <MinusIcon size={14} />
                </button>
                <span
                  style={{
                    color: 'var(--text)',
                    fontSize: '.85rem',
                    minWidth: 36,
                    textAlign: 'center',
                  }}
                >
                  {fontSize.toFixed(1)}
                </span>
                <button
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: '.7rem' }}
                  onClick={() => setFontSize(fontSize + 0.1)}
                >
                  <PlusIcon size={14} />
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  color: 'var(--text-dim)',
                  fontSize: '.78rem',
                  marginBottom: 8,
                }}
              >
                <FontIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />字体
              </div>
              <FontSearchDropdown
                fonts={FONT_LIST}
                current={readerFont}
                onSelect={setReaderFont}
              />
            </div>
          </div>
        </div>

        {/* 提示 Toast */}
        {tip && (
          <div
            style={{
              position: 'fixed',
              bottom: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(var(--glass-tip-blur))',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-full)',
              padding: '10px 24px',
              fontSize: '.85rem',
              color: 'var(--text)',
              zIndex: 500,
              animation: 'tipIn 0.3s ease',
            }}
          >
            {tip}
          </div>
        )}

        {/* 右键菜单 — 漫画库同款扁平图标 + 文字 */}
        {ctxMenu && !ctxSubMenu && (
          <div
            style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 599, cursor: 'default' }}
            onClick={() => { setCtxMenu(null); setCtxSubMenu(null); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <ContextMenu x={ctxMenu.x} y={ctxMenu.y}>
              <MenuItem
                icon={<BookmarkIcon size={16} />}
                label={bookmarks.find((b) => b.chapterIndex === currentChapter && b.paragraphIndex === ctxParagraphIndex) ? '取消书签' : '添加书签'}
                onClick={() => {
                  const existing = bookmarks.find((b) => b.chapterIndex === currentChapter && b.paragraphIndex === ctxParagraphIndex);
                  if (existing) {
                    useStore.setState({ bookmarks: bookmarks.filter(b => !(b.chapterIndex === currentChapter && b.paragraphIndex === ctxParagraphIndex)) });
                  } else {
                    const paras = chapterText.split('\n').filter(l => l.trim());
                    const snippet = paras[ctxParagraphIndex]?.slice(0, 40) || '';
                    addBookmark(currentChapter, chapters?.[currentChapter]?.title || `第${currentChapter + 1}章`);
                    const cur = useStore.getState().bookmarks;
                    if (cur.length > 0) {
                      const updated = [...cur.slice(0, -1), { ...cur[cur.length - 1], paragraphIndex: ctxParagraphIndex, textSnippet: snippet }];
                      useStore.setState({ bookmarks: updated });
                    }
                  }
                  setCtxMenu(null);
                  setCtxParagraphIndex(undefined);
                }}
              />
              <MenuDivider />
              <MenuItem icon={<PaletteIcon size={16} />} label="主题颜色" onClick={() => setCtxSubMenu('colors')} />
              <MenuItem icon={<FontIcon size={16} />} label="字体" onClick={() => setCtxSubMenu('font')} />
              <MenuDivider />
              <MenuItem icon={<BoldIcon size={16} />} label={fontBold ? '取消加粗' : '字体加粗'}
                onClick={() => { setFontBold(!fontBold); setCtxMenu(null); }}
              />
              <MenuDivider />
              <MenuItem icon={<MinusIcon size={16} />} label="缩小字号"
                onClick={() => { setFontSize(fontSize - 0.1); setCtxMenu(null); }}
              />
              <MenuItem icon={<PlusIcon size={16} />} label="放大字号"
                onClick={() => { setFontSize(fontSize + 0.1); setCtxMenu(null); }}
              />
            </ContextMenu>
          </div>
        )}

        {/* 颜色二级菜单 */}
        {ctxMenu && ctxSubMenu === 'colors' && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 609,
              cursor: 'default',
            }}
            onClick={() => {
              setCtxMenu(null);
              setCtxSubMenu(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              style={{
                position: 'fixed',
                left: ctxMenu.x + 10,
                top: ctxMenu.y,
                zIndex: 610,
                background: 'var(--glass-bg)',
                backdropFilter:
                  'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius-md)',
                padding: 14,
                minWidth: 210,
                boxShadow: '0 8px 40px var(--shadow)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  color: 'var(--text)',
                  fontSize: '.82rem',
                  marginBottom: 10,
                  fontWeight: 500,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span><PaletteIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />颜色</span>
                <span
                  style={{
                    cursor: 'pointer',
                    color: 'var(--text-dim)',
                    fontSize: '.8rem',
                  }}
                  onClick={() => {
                    setCtxSubMenu(null);
                  }}
                >
                  ← 返回
                </span>
              </div>
              <div
                style={{
                  fontSize: '.75rem',
                  color: 'var(--text-dim)',
                  marginBottom: 6,
                }}
              >
                <FontIcon size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />字体颜色
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                  marginBottom: 10,
                }}
              >
                {COLOR_PRESETS.map((c) => (
                  <div
                    key={'t' + c}
                    onClick={() => {
                      setReaderTextColor(c);
                      setCtxMenu(null);
                      setCtxSubMenu(null);
                    }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 'var(--radius-sm)',
                      background: c,
                      cursor: 'pointer',
                      outline:
                        readerTextColor === c
                          ? '2px solid var(--accent)'
                          : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
                {readerTextColor ? (
                  <span
                    onClick={() => {
                      setReaderTextColor('');
                    }}
                    style={{
                      color: 'var(--text-dim)',
                      fontSize: '.7rem',
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                  >
                    重置
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: '.75rem',
                  color: 'var(--text-dim)',
                  marginBottom: 6,
                }}
              >
                <PaletteIcon size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />背景颜色
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                }}
              >
                {COLOR_PRESETS.map((c) => (
                  <div
                    key={'b' + c}
                    onClick={() => {
                      setReaderBgColor(c);
                      setCtxMenu(null);
                      setCtxSubMenu(null);
                    }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 'var(--radius-sm)',
                      background: c,
                      cursor: 'pointer',
                      outline:
                        readerBgColor === c
                          ? '2px solid var(--accent)'
                          : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
                {readerBgColor ? (
                  <span
                    onClick={() => {
                      setReaderBgColor('');
                    }}
                    style={{
                      color: 'var(--text-dim)',
                      fontSize: '.7rem',
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                  >
                    重置
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* 字体二级菜单 */}
        {ctxMenu && ctxSubMenu === 'font' && (
          <div
            style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 609, cursor: 'default' }}
            onClick={() => { setCtxMenu(null); setCtxSubMenu(null); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <ContextMenu x={ctxMenu.x + 10} y={ctxMenu.y}>
              <div
                style={{
                  padding: '8px 14px 4px',
                  color: 'var(--text-dim)',
                  fontSize: '.78rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span><FontIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />字体</span>
                <span
                  style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '.8rem' }}
                  onClick={() => { setCtxSubMenu(null); }}
                >
                  ← 返回
                </span>
              </div>
              {FONT_LIST_SHORT.map((f) => (
                <MenuItem
                  key={f.value}
                  label={(readerFont || '') === f.value ? '✓ ' + f.label : f.label}
                  onClick={() => { setReaderFont(f.value); setCtxMenu(null); setCtxSubMenu(null); }}
                />
              ))}
            </ContextMenu>
          </div>
        )}
      </div>
    </>
  );
}
