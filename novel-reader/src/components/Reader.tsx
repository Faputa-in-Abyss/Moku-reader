import React, { useEffect, useRef, useState, useCallback } from 'react';
import BottomBar from './BottomBar';
import { useStore, Bookmark } from '../store';
import SidebarHandle from './SidebarHandle';
import WindowControls from './WindowControls';
import { ContextMenu, MenuDivider, MenuItem, topbarGlassStyle, BackButton } from './SharedUI';
import { useChapterLoader } from '../hooks/useChapterLoader';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useWheelHandler } from '../hooks/useWheelHandler';
import { useReaderKeyboard } from '../hooks/useReaderKeyboard';
import { usePagination } from '../hooks/usePagination';
import { useWindowControls } from '../hooks/useWindowControls';
import PageRenderer from './PageRenderer';
import ChapterList from './ChapterList';
import { FONT_LIST, FONT_LIST_SHORT } from '../constants/fonts';
import { BookmarkIcon, LayoutIcon, TextIcon, FontIcon, BoldIcon, MinusIcon, PlusIcon } from './FlatIcons';


function FontSearchDropdown({ fonts, current, onSelect }: {
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
  const filtered = fonts.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()));
  const currentLabel = fonts.find((f) => f.value === current)?.label || '默认衬线';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(!open)} style={{ background: 'var(--glass-bg)', color: 'var(--text)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: '.82rem', cursor: 'pointer', userSelect: 'none' }}>
        {currentLabel}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 10, overflow: 'hidden' }}>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索字体..." style={{ width: '100%', padding: '8px 10px', background: 'var(--glass-bg)', color: 'var(--text)', border: 'none', borderBottom: '1px solid var(--border-glass)', fontSize: '.8rem', outline: 'none' }} />
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {filtered.map((f) => (
              <div key={f.value} onClick={() => { onSelect(f.value); setOpen(false); setSearch(''); }} style={{ padding: '8px 10px', fontSize: '.8rem', color: f.value === current ? 'var(--accent)' : 'var(--text)', background: f.value === current ? 'rgba(var(--accent-rgb),0.06)' : 'transparent' }}>
                {f.label}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: '.78rem', color: 'var(--text-dim)', textAlign: 'center' }}>未找到匹配字体</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function charOffsetToParaIndex(text: string, charOffset: number): number {
  const rawLines = text.split('\n');
  let origOffset = 0;
  let paraIdx = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim()) {
      if (charOffset < origOffset + line.length) return paraIdx;
      paraIdx++;
    }
    origOffset += line.length + 1;
  }
  return Math.max(0, paraIdx - 1);
}

export default function Reader() {
  const book = useStore((s) => s.currentBook);
  const currentChapter = useStore((s) => s.currentChapter);
  const setChapter = useStore((s) => s.setChapter);
  const closeReader = useStore((s) => s.closeReader);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const fontWeight = useStore((s) => s.fontWeight);
  const readerFont = useStore((s) => s.readerFont);
  const setReaderFont = useStore((s) => s.setReaderFont);
  const readerTextColor = useStore((s) => s.readerTextColor);
  const readerBgColor = useStore((s) => s.readerBgColor);
  const lineHeight = useStore((s) => s.lineHeight);
  const letterSpacing = useStore((s) => s.letterSpacing);
  const textIndent = useStore((s) => s.textIndent);
  const textAlign = useStore((s) => s.textAlign);
  const autoFlipInterval = useStore((s) => s.autoFlipInterval);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const settingsOpen = false;
  const setSettingsOpen = () => {};
  const readingMode = useStore((s) => s.readingMode);
  const setReadingMode = useStore((s) => s.setReadingMode);
  const keybindings = useStore((s) => s.keybindings);
  const windowSize = useStore((s) => s.windowSize);
  const bookmarks = useStore((s) => s.bookmarks);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const loadBookmarks = useStore((s) => s.loadBookmarks);
  const readerDoublePage = useStore((s) => s.readerDoublePage);
  const setReaderDoublePage = useStore((s) => s.setReaderDoublePage);
  const chapters = book?.chapters || [];
  const chapterLoader = useChapterLoader();
  const readingProgress = useReadingProgress(book?.id);
  const wheelHandler = useWheelHandler();
  const bookIdRef = useRef(book?.id);
  useEffect(() => { bookIdRef.current = book?.id; }, [book?.id]);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(window.innerWidth < 420);
  const [veryNarrow, setVeryNarrow] = useState(window.innerWidth < 360);
  useEffect(() => {
    const onResize = () => { setNarrow(window.innerWidth < 420); setVeryNarrow(window.innerWidth < 360); };
    window.addEventListener('resize', onResize);
    const onWheel = () => { setCtxMenu(null); };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('wheel', onWheel); };
  }, []);
  const { maximized, handleMinimize, handleMaximizeToggle, handleClose: handleWindowClose } = useWindowControls();
  const [chapterText, setChapterText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tip, setTip] = useState('');
  const [sidebarHint, setSidebarHint] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxParagraphIndex, setCtxParagraphIndex] = useState<number | undefined>(undefined);
  const tipTimer = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const topbarTimer = useRef<number>(0);
  const sideTimer = useRef<number>(0);
  const sidebarOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const skipChapterLoadRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const restoreTargetRef = useRef<number | null>(null);
  const lastTopParaRef = useRef(0);
  const wheelLockRef = useRef(false);
  const scrollToEndRef = useRef(false);
  const goToEndRef = useRef(false);
  const pendingCharOffsetRef = useRef<number | null>(null);
  sidebarOpenRef.current = sidebarOpen;
  
  const contentWidth = narrow ? Math.min(window.innerWidth - 32, 680) : ([408, 544, 680, 816, 952][windowSize] || 680);
  const pageFontFamily = readerFont || "'Georgia','Noto Serif SC',serif";
  useEffect(() => {
    if (readingMode !== 'page') return;
    const el = viewportRef.current;
    if (!el) return;
    const update = () => { setVw(el.clientWidth); setVh(el.clientHeight); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [readingMode]);
  const padLR = narrow ? 32 : 48;
  const padTop = 40;
  const padBottom = 80;
  const gapDouble = 24;
  const pageHeight = Math.max(120, vh - padTop - padBottom);
  const pageWidth = readerDoublePage
    ? Math.max(200, Math.floor((vw - padLR * 2 - gapDouble * 2 - 1) / 2))
    : Math.min(contentWidth, Math.max(200, vw - padLR * 2));
  const { pages, measureRef } = usePagination({
    text: chapterText,
    pageWidth,
    pageHeight,
    fontSize,
    lineHeight,
    fontFamily: pageFontFamily,
    fontWeight,
    letterSpacing,
    textIndent,
    textAlign,
    enabled: readingMode === 'page' && vw > 0 && vh > 0,
  });
  useEffect(() => {
    const check = () => { if (window.innerWidth < 768 && readerDoublePage) { setReaderDoublePage(false); } };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [readerDoublePage, setReaderDoublePage]);
  const saveScrollPosition = (chapterIdx: number) => {
    if (!book?.id) return;
    const el = contentRef.current;
    if (el && readingMode === 'scroll') {
      localStorage.setItem('nr-scroll-pos-' + book.id + '-' + chapterIdx, String(el.scrollTop));
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
      try { await chapterLoader.openCache(book!.id); } catch {}
      const data = await chapterLoader.loadChapterText(book!.id, currentChapter);
      if (cancelled) return;
      if (!data) {
        showTip('读取章节失败，请检查书籍文件');
        setChapterText('(读取章节失败)');
        setIsLoading(false);
        return;
      }
      setChapterText(data.text);
      const savedPos = readingProgress.restorePosition(currentChapter);
      restoreTargetRef.current = savedPos && savedPos.chapterIndex === currentChapter && savedPos.charOffset > 0
        ? savedPos.charOffset
        : 0;
      setIsLoading(false);
    }
    if (skipChapterLoadRef.current) { skipChapterLoadRef.current = false; return; }
    wheelHandler.resetWheel();
    contentRef.current?.scrollTo({ top: 0 });
    setPageIndex(0);
    loadCurrentChapterData();
    if (book?.id) loadBookmarks(book.id);
    return () => { cancelled = true; };
  }, [currentChapter, book?.id]);
  useEffect(() => {
    if (readingMode !== 'scroll' || !book?.id || !chapterText || chapterText.startsWith('(')) return;
    if (scrollToEndRef.current) {
      scrollToEndRef.current = false;
      requestAnimationFrame(() => {
        if (contentRef.current) { contentRef.current.scrollTop = contentRef.current.scrollHeight; }
      });
      return;
    }
    const savedScrollTop = localStorage.getItem('nr-scroll-pos-' + book.id + '-' + currentChapter);
    requestAnimationFrame(() => {
      if (contentRef.current) { contentRef.current.scrollTop = savedScrollTop ? Number(savedScrollTop) : 0; }
    });
  }, [chapterText, currentChapter, readingMode]);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const id = bookIdRef.current;
      if (!id) return;
      try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('update_progress', { bookId: id, chapterIndex: currentChapter }); } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [currentChapter]);
  const switchChapter = useCallback((newIdx: number) => {
    const cachedText = chapterLoader.textCache.current.get(newIdx);
    if (cachedText) {
      skipChapterLoadRef.current = true;
      setChapterText(cachedText.text);
      const saved = readingProgress.restorePosition(newIdx);
      restoreTargetRef.current = saved?.chapterIndex === newIdx && saved.charOffset > 0
        ? saved.charOffset
        : 0;
      setPageIndex(0);
      setChapter(newIdx);
    } else {
      setChapter(newIdx);
    }
  }, [chapterLoader, readingProgress, setChapter]);
  const nextPage = () => {
    if (!chapterText || chapterText === '(没有章节内容)' || chapterText.startsWith('(读取章节失败') || chapterText === '') return;
    if (readingMode === 'page') {
      if (pages.length === 0) return;
      const step = readerDoublePage ? 2 : 1;
      const aligned = readerDoublePage && pageIndex % 2 === 1 ? pageIndex - 1 : pageIndex;
      if (aligned + step < pages.length) {
        setPageIndex(aligned + step);
      } else if (currentChapter < chapters.length - 1) {
        switchChapter(currentChapter + 1);
      } else { showTip('已经是最后一页'); }
    } else if (currentChapter < chapters.length - 1) { saveScrollPosition(currentChapter); switchChapter(currentChapter + 1); } else { showTip('已经是最后一章'); }
  };
  const prevPage = () => {
    if (!chapterText || chapterText === '(没有章节内容)' || chapterText.startsWith('(读取章节失败') || chapterText === '') return;
    if (readingMode === 'page') {
      if (pages.length === 0) return;
      const step = readerDoublePage ? 2 : 1;
      const aligned = readerDoublePage && pageIndex % 2 === 1 ? pageIndex - 1 : pageIndex;
      if (aligned - step >= 0) {
        setPageIndex(aligned - step);
      } else if (currentChapter > 0) {
        goToEndRef.current = true;
        switchChapter(currentChapter - 1);
      } else { showTip('已经是第一页'); }
    } else if (currentChapter > 0) { saveScrollPosition(currentChapter); scrollToEndRef.current = true; switchChapter(currentChapter - 1); } else { showTip('已经是第一章'); }
  };
  useReaderKeyboard(keybindings, fontSize, setFontSize, prevPage, nextPage, recordingKey);
  useEffect(() => {
    if (!book?.id || !chapterText || readingMode !== 'page' || pages.length === 0) return;
    const topPara = pages[pageIndex]?.[0] ?? 0;
    readingProgress.savePosition({ chapterIndex: currentChapter, charOffset: topPara, pageIndex, scrollOffset: 0 });
  }, [currentChapter, book?.id, readingMode, pageIndex, readingProgress]);
  useEffect(() => {
    if (readingMode !== 'scroll' || !book?.id) return;
    const el = contentRef.current;
    if (!el) return;
    let timer: number;
    const onScroll = () => { clearTimeout(timer); timer = window.setTimeout(() => { localStorage.setItem('nr-scroll-pos-' + book.id + '-' + currentChapter, String(el.scrollTop)); }, 300); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer); };
  }, [readingMode, book?.id, currentChapter]);
  useEffect(() => {
    if (readingMode !== 'page' || pages.length === 0) return;
    let target: number;

    if (goToEndRef.current) {
      goToEndRef.current = false;
      if (readerDoublePage) {
        let lastIdx = pages.length - 1;
        if (lastIdx % 2 === 1) lastIdx--;
        setPageIndex(Math.max(0, lastIdx));
      } else {
        setPageIndex(Math.max(0, pages.length - 1));
      }
      return;
    }

    if (pendingCharOffsetRef.current != null) {
      target = charOffsetToParaIndex(chapterText, pendingCharOffsetRef.current);
      pendingCharOffsetRef.current = null;
    } else if (restoreTargetRef.current != null) {
      target = restoreTargetRef.current;
      restoreTargetRef.current = null;
    } else {
      target = lastTopParaRef.current;
    }
    const foundIdx = pages.findIndex((pg) => pg.includes(target));
    let newIdx = foundIdx >= 0 ? foundIdx : 0;
    if (readerDoublePage && newIdx % 2 === 1) newIdx = Math.max(0, newIdx - 1);
    setPageIndex(newIdx);
  }, [pages, readingMode, readerDoublePage, chapterText]);
  useEffect(() => {
    if (readingMode !== 'page' || pages.length === 0) return;
    const top = pages[pageIndex]?.[0];
    if (top != null) lastTopParaRef.current = top;
  }, [pageIndex, pages, readingMode]);
  const handleClose = () => { readingProgress.saveNow(); chapterLoader.closeCache(); closeReader(); };
  const handleWheel = (e: React.WheelEvent) => {
    if (!chapterText || chapterText === '(没有章节内容)' || chapterText.startsWith('(读取章节失败') || chapterText === '') return;
    if (readingMode === 'page') {
      if (wheelLockRef.current) return;
      if (e.deltaY > 0) nextPage(); else if (e.deltaY < 0) prevPage();
      if (e.deltaY !== 0) {
        wheelLockRef.current = true;
        setTimeout(() => { wheelLockRef.current = false; }, 30);
      }
      return;
    }
    if (readingMode === 'scroll') {
      const el = contentRef.current;
      if (!el) return;
      wheelHandler.onWheel(e, currentChapter, chapters.length, el.scrollTop, el.scrollHeight, el.clientHeight, el,
        () => { saveScrollPosition(currentChapter); switchChapter(currentChapter + 1); },
        () => { saveScrollPosition(currentChapter); scrollToEndRef.current = true; switchChapter(currentChapter - 1); }
      );
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    clearTimeout(topbarTimer.current);
    if (!narrow) {
      if (e.clientY < 80) { document.querySelector('.reader-topbar')?.classList.add('visible'); }
      else {
        const tb = document.querySelector('.reader-topbar');
        if (tb) {
          const rect = tb.getBoundingClientRect();
          if (!tb.classList.contains('visible') || e.clientY > rect.bottom) {
            topbarTimer.current = window.setTimeout(() => {
              if (!sidebarOpenRef.current) { document.querySelector('.reader-topbar')?.classList.remove('visible'); }
            }, 300);
          }
        }
      }
    }
    setSidebarHint(e.clientX >= 28 && e.clientX < 100 && e.clientY > 120 && e.clientY < window.innerHeight - 60 && !sidebarOpen);
    if (e.clientX < 15 && e.clientY > 120 && e.clientY < window.innerHeight - 60 && !sidebarOpenRef.current) { setSidebarOpen(true); }
    else if (e.clientX >= 60) {
      if (sidebarOpenRef.current) {
        if (e.clientX > 280) { if (!sideTimer.current) { sideTimer.current = window.setTimeout(() => { setSidebarOpen(false); sideTimer.current = 0; }, 500); } }
        else { if (sideTimer.current) { clearTimeout(sideTimer.current); sideTimer.current = 0; } }
      }
    }
  };
  const handleMouseLeave = () => {
    clearTimeout(topbarTimer.current);
    if (!sidebarOpenRef.current) { document.querySelector('.reader-topbar')?.classList.remove('visible'); }
    if (sideTimer.current) { clearTimeout(sideTimer.current); sideTimer.current = 0; }
  };
  useEffect(() => {
    const canvas = document.getElementById('reader-particle-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    let running = true;
    const particles: any[] = [];
    for (let i = 0; i < 60; i++) particles.push({ x: Math.random() * W, y: Math.random() * H, s: 0.8 + Math.random() * 1.8, sx: (Math.random() - 0.5) * 0.15, sy: (Math.random() - 0.5) * 0.15, o: 0.08 + Math.random() * 0.25, wf: 0.005 + Math.random() * 0.015, wa: 0.2 + Math.random() * 0.6, wo: Math.random() * 6.28, cm: Math.random() });
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    let clr: number[] = [];
    const getClr = () => { const s = getComputedStyle(document.documentElement); const p = s.getPropertyValue('--accent-rgb').trim().split(',').map(Number); clr = p.length === 3 ? p : [184, 137, 80]; };
    getClr();
    let time = 0;
    const animate = () => {
      if (!running) return;
      ctx!.clearRect(0, 0, W, H);
      time += 0.015;
      for (const p of particles) {
        const wb = Math.sin(time * p.wf + p.wo) * p.wa;
        p.sx += (Math.random() - 0.5) * 0.015; p.sy += (Math.random() - 0.5) * 0.015;
        p.sx *= 0.98; p.sy *= 0.98;
        p.x += p.sx + wb * 0.02; p.y += p.sy + Math.cos(time * p.wf + p.wo) * 0.1;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.s, 0, 6.28);
        ctx!.fillStyle = 'rgba(' + clr[0] + ',' + clr[1] + ',' + clr[2] + ',' + p.o + ')';
        ctx!.fill();
      }
      requestAnimationFrame(animate);
    };
    animate();
    return () => { running = false; window.removeEventListener('resize', resize); };
  }, []);
  // 自动翻页定时器
  useEffect(() => {
    if (autoFlipInterval <= 0) return;
    const id = setInterval(() => { nextPage(); }, autoFlipInterval * 1000);
    return () => clearInterval(id);
  }, [autoFlipInterval, pageIndex, currentChapter]);
  useEffect(() => { return () => { clearTimeout(topbarTimer.current); clearTimeout(tipTimer.current); clearTimeout(sideTimer.current); }; }, []);
  const renderContent = () => {
    const curParas = new Set(bookmarks.filter(b => b.chapterIndex === currentChapter && b.paragraphIndex !== undefined).map(b => b.paragraphIndex!));
    if (!chapterText || chapterText === '(没有章节内容)' || chapterText.startsWith('(读取章节失败')) {
      return <div ref={viewportRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>{isLoading ? '加载中...' : ''}</div>;
    }
    if (readingMode === 'page') {
      const paras = chapterText.split('\n').filter((l) => l.trim());
      const renderPage = (idx: number) => {
        if (idx < 0 || idx >= pages.length) return null;
        const pageParas = pages[idx];
        if (!pageParas || pageParas.length === 0) return null;
        const start = pageParas[0];
        const end = pageParas[pageParas.length - 1] + 1;
        const sliceText = paras.slice(start, end).join('\n');
        return (
          <PageRenderer text={sliceText} fontSize={fontSize} lineHeight={lineHeight} fontFamily={pageFontFamily}
            fontWeight={fontWeight} textColor={readerTextColor}
            bookmarkParagraphIndices={curParas} paragraphOffset={start}
            textIndent={`${textIndent}em`} textAlign={textAlign} letterSpacing={letterSpacing} />
        );
      };
      const titleBlock = chapters?.[currentChapter]?.title && (
        <div style={{ textAlign: 'center', marginBottom: 16, fontSize: '.95rem', fontWeight: 600, color: 'var(--text)' }}>
          {chapters[currentChapter].title}
        </div>
      );
      return (
        <div ref={viewportRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: `${padTop}px ${padLR}px ${padBottom}px`, boxSizing: 'border-box', width: '100%' }}>
            <div style={{ width: pageWidth, maxWidth: '100%', overflow: 'hidden' }}>
              {titleBlock}
              {renderPage(pageIndex)}
            </div>
            {readerDoublePage && (
              <>
                <div style={{ width: gapDouble, flexShrink: 0 }} />
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-glass)', opacity: 0.5, flexShrink: 0 }} />
                <div style={{ width: gapDouble, flexShrink: 0 }} />
                <div style={{ width: pageWidth, maxWidth: '100%', overflow: 'hidden' }}>
                  {renderPage(pageIndex + 1)}
                </div>
              </>
            )}
          </div>
          <div ref={measureRef} style={{ position: 'absolute', left: '-99999px', top: 0, visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box' }} />
        </div>
      );
    }
    return (
      <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '40px 48px 80px', maxWidth: contentWidth, margin: '0 auto', width: '100%' }}>
        {chapters?.[currentChapter]?.title && <div style={{ textAlign: 'center', marginBottom: 24, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>{chapters[currentChapter].title}</div>}
        <PageRenderer text={chapterText} fontSize={fontSize} lineHeight={lineHeight} fontFamily={pageFontFamily}
          fontWeight={fontWeight} textColor={readerTextColor} bookmarkParagraphIndices={curParas} paragraphOffset={0}
          textIndent={`${textIndent}em`} textAlign={textAlign} letterSpacing={letterSpacing} />
      </div>
    );
  };
  return (
    <>
      <canvas id="reader-particle-canvas" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 199, pointerEvents: 'none' }} />
      <div className="reader-view" onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (e.button === 0) {
            // 如果点击在右键菜单内则不关闭
            const menuEl = document.querySelector('.ctx-menu-container');
            if (menuEl && menuEl.contains(e.target as Node)) return;
            setCtxMenu(null);

            // 收起顶部栏（点击顶栏外部时）
            const tb = document.querySelector('.reader-topbar');
            if (tb && !tb.contains(e.target as Node)) {
              tb.classList.remove('visible');
            }
          }
          if (e.button === 2) {
            let pIdx;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const pEl = el?.closest('[data-paragraph-index]');
            if (pEl) { const idx = pEl.getAttribute('data-paragraph-index'); if (idx) pIdx = parseInt(idx, 10); }
            setCtxParagraphIndex(pIdx); setCtxMenu({ x: e.clientX, y: e.clientY }); 
          }
        }}
        onTouchStart={(e) => { if (!narrow) return; const t = e.touches[0]; touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }; }}
        onTouchEnd={(e) => {
          if (!narrow) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStartRef.current.x;
          const dy = t.clientY - touchStartRef.current.y;
          const dt = Date.now() - touchStartRef.current.time;
          if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx > 0) prevPage(); else nextPage(); return; }
          if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && dt < 300) {
            const w = window.innerWidth; const x = t.clientX;
            if (x < w * 0.3) { prevPage(); } else if (x > w * 0.7) { nextPage(); } else { setToolbarVisible((v) => !v); }
          }
        }}
        style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 200, background: readerBgColor || 'var(--reader-bg)', flexDirection: 'column', opacity: 1, visibility: 'visible', transition: 'background 0.6s ease' }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onWheel={handleWheel}>
        <div className="reader-topbar" style={{
          ...topbarGlassStyle, ...(narrow ? { padding: '10px 12px' } : {}),
          opacity: narrow ? (toolbarVisible ? 1 : 0) : 0,
          transform: narrow ? (toolbarVisible ? 'translateY(0)' : 'translateY(-100%)') : 'translateY(-100%)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }} data-tauri-drag-region>
          <div className="light-follow" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1, whiteSpace: 'nowrap' }}>
            <BackButton onClick={handleClose} label={narrow ? '←' : '← 返回书库'} />
            <span style={{ fontFamily: 'var(--font-title)', fontWeight: 500, maxWidth: narrow ? (veryNarrow ? 0 : 120) : 240, opacity: veryNarrow ? 0 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'max-width 0.3s ease, opacity 0.3s ease' }}>{book?.title}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 1, alignItems: 'center' }}>
            <button className="btn" onClick={() => { if (window.innerWidth < 768) { showTip('窗口过窄无法开启双页模式'); return; } setReaderDoublePage(!readerDoublePage); }}
              disabled={window.innerWidth < 768}
              style={{ fontSize: '.78rem', opacity: readingMode === 'page' && !narrow ? 1 : 0, maxWidth: readingMode === 'page' && !narrow ? 60 : 0, overflow: 'hidden', whiteSpace: 'nowrap', background: readerDoublePage ? 'rgba(var(--accent-rgb),0.12)' : undefined, borderColor: readerDoublePage ? 'var(--accent)' : undefined, transition: 'opacity 0.3s ease, max-width 0.3s ease' }}
            >{readerDoublePage ? '双页' : '单页'}</button>

            <div data-tauri-no-drag><WindowControls onMinimize={handleMinimize} onMaximize={handleMaximizeToggle} onClose={handleWindowClose} maximized={maximized} foldable={false} /></div>
          </div>
        </div>
        {renderContent()}
        <SidebarHandle open={sidebarOpen} hint={sidebarHint} sidebarWidth={280} zIndex={399} />
        <ChapterList chapters={chapters} currentChapter={currentChapter} bookmarks={bookmarks} open={sidebarOpen} bookId={book?.id}
          onSelect={(idx, charOffset) => {
            saveScrollPosition(currentChapter);
            switchChapter(idx);
            if (charOffset !== undefined) {
              if (readingMode === 'page') {
                pendingCharOffsetRef.current = charOffset;
              } else {
                const scrollToMatch = () => { const el = contentRef.current; if (!el) return; el.scrollTop = Math.min(1, charOffset / chapterText.length) * (el.scrollHeight - el.clientHeight); };
                setTimeout(scrollToMatch, 100); setTimeout(scrollToMatch, 300);
              }
            }
          }}
          onClose={() => setSidebarOpen(false)} onRemoveBookmark={removeBookmark} />

        <BottomBar />
        {tip && <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-tip-blur))', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-full)', padding: '10px 24px', fontSize: '.85rem', color: 'var(--text)', zIndex: 500, animation: 'tipIn 0.3s ease' }}>{tip}</div>}
        {ctxMenu && (
          <div className="ctx-menu-container">
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y}>
            <MenuItem icon={<BookmarkIcon size={16} />}
              label={bookmarks.find((b) => b.chapterIndex === currentChapter && b.paragraphIndex === ctxParagraphIndex) ? '取消书签' : '添加书签'}
              onClick={() => {
                const existing = bookmarks.find((b) => b.chapterIndex === currentChapter && b.paragraphIndex === ctxParagraphIndex);
                const paras = chapterText.split('\n').filter(l => l.trim());
                const snippet = paras[ctxParagraphIndex ?? 0]?.slice(0, 40) || '';
                const title = chapters?.[currentChapter]?.title || '第' + (currentChapter + 1) + '章';
                if (existing) {
                  const next = bookmarks.filter(b => !(b.chapterIndex === currentChapter && b.paragraphIndex === ctxParagraphIndex));
                  useStore.setState({ bookmarks: next });
                  const book = useStore.getState().currentBook;
                  if (book) localStorage.setItem(`nr-bookmarks-${book.id}`, JSON.stringify(next));
                } else {
                  const newBm: Bookmark = { chapterIndex: currentChapter, chapterTitle: title, timestamp: Date.now(), paragraphIndex: ctxParagraphIndex, textSnippet: snippet };
                  const next = [...bookmarks, newBm];
                  useStore.setState({ bookmarks: next });
                  const book = useStore.getState().currentBook;
                  if (book) localStorage.setItem(`nr-bookmarks-${book.id}`, JSON.stringify(next));
                }
                setCtxMenu(null); setCtxParagraphIndex(undefined);
              }} />

          </ContextMenu>
          </div>
        )}
      </div>
    </>
  );
}
