import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useStore } from "../store";
import SidebarHandle from "./SidebarHandle";

export default function MangaReader() {
  const currentManga = useStore((s) => s.currentManga);
  const mangaCurrentPage = useStore((s) => s.mangaCurrentPage);
  const setMangaPage = useStore((s) => s.setMangaPage);
  const closeMangaReader = useStore((s) => s.closeMangaReader);
  const mangaViewMode = useStore((s) => s.mangaViewMode);
  const setMangaViewMode = useStore((s) => s.setMangaViewMode);
  const mangaZoom = useStore((s) => s.mangaZoom);
  const setMangaZoom = useStore((s) => s.setMangaZoom);
  const seriesMap = useStore((s) => s.seriesMap);

  const manga = currentManga;
  const [loadedPages, setLoadedPages] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState("");
  const tipTimer = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const mangaZoomRef = useRef(mangaZoom);
  const navTimer = useRef<number>(0);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const [mangaSidebar, setMangaSidebar] = useState(false);
  const [sidebarHint, setSidebarHint] = useState(false);
  const sideTimer = useRef<number>(0);
  const [scrollVisibleRange, setScrollVisibleRange] = useState({ start: 0, end: 20 });
  const [showAllSidebar, setShowAllSidebar] = useState(false);

  // D6: Lazy init — call useStore.getState() once at mount, not on every render
  const [sidebarComics, setSidebarComics] = useState(() => useStore.getState().comics);
  const [comicSearch, setComicSearch] = useState("");
  // 同系列章节列表
  const seriesChapters = useMemo(() => {
    if (!manga || !manga.series_id) return [];
    const ids = seriesMap[manga.series_id] || [];
    return ids
      .map((id) => useStore.getState().comics.find((c) => c.id === id))
      .filter((c): c is typeof manga => c != null);
  }, [manga, seriesMap]);
  const currentSeriesIdx = useMemo(() => {
    if (!manga || !manga.series_id) return -1;
    return seriesChapters.findIndex((c) => c.id === manga.id);
  }, [manga, seriesChapters]);

  const isRtl = manga?.direction === "rtl";
  const totalPages = manga?.total_pages ?? 0;

  const showTip = useCallback((msg: string) => {
    clearTimeout(tipTimer.current);
    setTip(msg);
    tipTimer.current = window.setTimeout(() => setTip(""), 2000);
  }, []);

  useEffect(() => {
    return () => { clearTimeout(tipTimer.current); clearTimeout(sideTimer.current); };
  }, []);

  useEffect(() => {
    if (!manga) return;
    if (mangaViewMode === "scroll") return;

    const t1 = performance.now();
    const preloadAhead = 10;
    const preloadBehind = 2;
    const pagesToLoad: number[] = [];
    const start = Math.max(0, mangaCurrentPage - preloadBehind);
    const end = Math.min(totalPages - 1, mangaCurrentPage + preloadAhead);
    for (let i = start; i <= end; i++) {
      if (!loadedPages[i]) pagesToLoad.push(i);
    }
    if (pagesToLoad.length === 0) return;
    setLoading(true);
    const newPages: Record<number, string> = {};
    for (const idx of pagesToLoad) {
      newPages[idx] = getPageUrl(manga, idx);
    }
    setLoadedPages((prev) => ({ ...prev, ...newPages }));
    const t2 = performance.now();
    console.log(`[perf] 第${pagesToLoad.length}页路径构造完成, 耗时 ${(t2 - t1).toFixed(0)}ms`);
    setLoading(false);
  }, [manga?.id, mangaCurrentPage, mangaViewMode, totalPages]);

  // 滚动模式：按可见区域加载，直接构造 URL
  useEffect(() => {
    if (!manga || mangaViewMode !== "scroll") return;
    const el = scrollRef.current;
    if (!el) return;
    let timer: number;
    const handle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!el) return;
        const viewTop = el.scrollTop;
        const viewBottom = viewTop + el.clientHeight;
        const estPageH = 600;
        const screenPages = Math.ceil(el.clientHeight / estPageH);
        const start = Math.max(0, Math.floor(viewTop / estPageH) - 2 * screenPages);
        const end = Math.min(totalPages - 1, Math.ceil(viewBottom / estPageH) + 5 * screenPages);
        const toLoad: number[] = [];
        for (let i = start; i <= end; i++) {
          if (!loadedPages[i]) toLoad.push(i);
        }
        if (toLoad.length === 0) return;
        const newPages: Record<number, string> = {};
        for (const idx of toLoad) {
          newPages[idx] = getPageUrl(manga, idx);
        }
        setLoadedPages((prev) => ({ ...prev, ...newPages }));
        // 滚动虚拟列表——只在可见区域渲染
        if (mangaViewMode === "scroll") {
          const estPageH = 600;
          const scrollTop = el.scrollTop;
          const clientH = el.clientHeight;
          const vStart = Math.max(0, Math.floor(scrollTop / estPageH) - 5);
          const vEnd = Math.min(totalPages, vStart + Math.ceil(clientH / estPageH) + 15);
          setScrollVisibleRange({ start: vStart, end: vEnd });
        }
      }, 200);
    };
    el.addEventListener("scroll", handle, { passive: true });
    handle(); // 首次加载
    return () => { el.removeEventListener("scroll", handle); clearTimeout(timer); };
  }, [manga?.id, mangaViewMode, totalPages]);

  useEffect(() => {
    if (!manga) return;
    const tid = setTimeout(async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_comic_progress", { comicId: manga.id, pageIndex: mangaCurrentPage });
        // 同步更新内存中的 current_page，让侧栏进度条实时刷新
        useStore.setState({ currentManga: { ...manga, current_page: mangaCurrentPage } });
      } catch {}
    }, 500);
    return () => clearTimeout(tid);
  }, [mangaCurrentPage, manga?.id]);

  useEffect(() => {
    if (mangaViewMode === "scroll" && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [manga?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!manga) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      switch (e.key) {
        case "ArrowRight": e.preventDefault(); if (isRtl) prevPage(); else nextPage(); break;
        case "ArrowLeft": e.preventDefault(); if (isRtl) nextPage(); else prevPage(); break;
        case "ArrowUp": e.preventDefault(); prevPage(); break;
        case "ArrowDown": e.preventDefault(); nextPage(); break;
        case "+": case "=": e.preventDefault(); setMangaZoom(Math.min(4, mangaZoom + 0.2)); break;
        case "-": e.preventDefault(); setMangaZoom(Math.max(0.25, mangaZoom - 0.2)); break;
        case "Escape": closeMangaReader(); break;
        case "m": e.preventDefault();
          {
            const modes = ["single", "double", "scroll"];
            const curIdx = modes.indexOf(mangaViewMode);
            setMangaViewMode(modes[(curIdx + 1) % 3] as any);
            showTip(`已切换为 ${["单页", "双页", "滚动"][(curIdx + 1) % 3]} 模式`);
          }
          break;
        case "r": e.preventDefault();
          {
            const newDir = isRtl ? "ltr" : "rtl";
            import("@tauri-apps/api/core").then(({ invoke }) => {
              invoke("update_comic_direction", { comicId: manga.id, direction: newDir }).then(() => {
                showTip(isRtl ? "已切换为从左到右" : "已切换为从右到左");
                useStore.setState({ currentManga: { ...manga, direction: newDir } });
              }).catch(() => {});
            });
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [manga, mangaCurrentPage, mangaZoom, isRtl, mangaViewMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y, moved: false };
  }, [panOffset]);

  const handleMouseMove = (e: React.MouseEvent) => {
    clearTimeout(navTimer.current);

    // 鼠标靠近顶部（~80px）才显示栏，否则隐藏
    if (e.clientY < 100) {
      setToolbarVisible(true);
    } else {
      setToolbarVisible(false);
    }

    // 侧栏提示：扩大触发范围（100px），让用户更早看到 > 箭头；实际侧栏触发仍保持 30px
    setSidebarHint(e.clientX >= 28 && e.clientX < 100 && e.clientY > 120 && e.clientY < window.innerHeight - 60 && mangaZoom === 1 && !mangaSidebar);

    // 鼠标靠近左边缘弹出漫画侧栏——直接从 store 取漫画列表，避免全量 IPC
    // 缩窄触发区（30px）且避开顶部工具栏区域（Y > 120），避免误触
    if (e.clientX < 30 && e.clientY > 120 && e.clientY < window.innerHeight - 60 && mangaZoom === 1) {
      if (!mangaSidebar) {
        // 优先用已有 comics，为空时兜底读 store
        if (sidebarComics.length === 0) {
          const storeComics = useStore.getState().comics;
          if (storeComics.length > 0) setSidebarComics(storeComics);
        }
      }
      setMangaSidebar(true);
    } else if (e.clientX >= 260) {
      if (mangaSidebar) {
        clearTimeout(sideTimer.current);
        sideTimer.current = window.setTimeout(() => { setMangaSidebar(false); }, 400);
      }
    } else {
      clearTimeout(sideTimer.current);
      sideTimer.current = 0;
    }

    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStart.current.moved = true;
    setPanOffset({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const nextPage = useCallback(() => {
    if (!manga) return;
    setMangaZoom(1);
    setPanOffset({ x: 0, y: 0 });
    if (mangaViewMode === "double") {
      const advance = mangaCurrentPage === 0 ? 1 : 2;
      const next = Math.min(totalPages - 1, mangaCurrentPage + advance);
      if (next === mangaCurrentPage) {
        // 最后一页 → 跳到下一章节（如果有）
        if (currentSeriesIdx >= 0 && currentSeriesIdx < seriesChapters.length - 1) {
          const nextComic = seriesChapters[currentSeriesIdx + 1];
          useStore.setState({ currentManga: nextComic, mangaCurrentPage: 0 });
          setLoadedPages({});
          showTip(`下一章：${nextComic.title}`);
        } else {
          showTip("已经是最后一页");
        }
      } else setMangaPage(next);
    } else {
      if (mangaCurrentPage < totalPages - 1) setMangaPage(mangaCurrentPage + 1);
      else {
        if (currentSeriesIdx >= 0 && currentSeriesIdx < seriesChapters.length - 1) {
          const nextComic = seriesChapters[currentSeriesIdx + 1];
          useStore.setState({ currentManga: nextComic, mangaCurrentPage: 0 });
          setLoadedPages({});
          showTip(`下一章：${nextComic.title}`);
        } else {
          showTip("已经是最后一页");
        }
      }
    }
  }, [manga, mangaCurrentPage, mangaViewMode, totalPages, currentSeriesIdx, seriesChapters]);

  const prevPage = useCallback(() => {
    if (!manga) return;
    setMangaZoom(1);
    setPanOffset({ x: 0, y: 0 });
    if (mangaViewMode === "double") {
      const retreat = mangaCurrentPage <= 1 ? 1 : 2;
      const next = Math.max(0, mangaCurrentPage - retreat);
      if (next === mangaCurrentPage) showTip("已经是第一页");
      else setMangaPage(next);
    } else {
      if (mangaCurrentPage > 0) setMangaPage(mangaCurrentPage - 1);
      else {
        // 第一页 → 跳到上一章节（如果有）
        if (currentSeriesIdx > 0) {
          const prevComic = seriesChapters[currentSeriesIdx - 1];
          useStore.setState({ currentManga: prevComic, mangaCurrentPage: prevComic.total_pages - 1 });
          setLoadedPages({});
          showTip(`上一章：${prevComic.title}`);
        } else {
          showTip("已经是第一页");
        }
      }
    }
  }, [manga, mangaCurrentPage, mangaViewMode, currentSeriesIdx, seriesChapters]);

  // 滚动翻页 + Ctrl+滚轮缩放（原生 addEventListener 避免 passive 报错）
  const isRtlRef = useRef(isRtl);
  const viewModeRef = useRef(mangaViewMode);
  const panOffsetRef = useRef(panOffset);
  useEffect(() => { isRtlRef.current = isRtl; }, [isRtl]);
  useEffect(() => { viewModeRef.current = mangaViewMode; }, [mangaViewMode]);
  useEffect(() => { mangaZoomRef.current = mangaZoom; }, [mangaZoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // 如果事件来自侧栏内部，不处理（侧栏本身也是 mainRef 的子元素）
      if ((e.target as HTMLElement)?.closest?.("[data-sidebar]")) return;
      if (viewModeRef.current === "scroll") return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - rect.left - rect.width / 2;
        const dy = e.clientY - rect.top - rect.height / 2;
        const oldZoom = mangaZoomRef.current;
        const newZoom = Math.min(4, Math.max(0.25, oldZoom + (e.deltaY > 0 ? -0.1 : 0.1)));
        const ratio = newZoom / oldZoom;
        const p = panOffsetRef.current;
        setPanOffset({ x: dx + (p.x - dx) * ratio, y: dy + (p.y - dy) * ratio });
        setMangaZoom(newZoom);
        return;
      }
      e.preventDefault();
      const forward = e.deltaY > 0;
      // 如果图片被拖动或缩放，第一次滚轮先复位，不翻页
      const p = panOffsetRef.current;
      const z = mangaZoomRef.current;
      if (p.x !== 0 || p.y !== 0 || z !== 1) {
        setPanOffset({ x: 0, y: 0 });
        setMangaZoom(1);
        showTip("已复位缩放，再滚动翻页");
        return;
      }
      if (isRtlRef.current) {
        if (forward) prevPageRef.current(); else nextPageRef.current();
      } else {
        if (forward) nextPageRef.current(); else prevPageRef.current();
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const prevPageRef = useRef(prevPage);
  const nextPageRef = useRef(nextPage);
  useEffect(() => { prevPageRef.current = prevPage; }, [prevPage]);
  useEffect(() => { nextPageRef.current = nextPage; }, [nextPage]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragStart.current.moved) return; // 拖拽后不触发翻页
    if (mangaZoom !== 1) return; // 缩放时只拖拽不翻页
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (isRtl) {
      if (x < w * 0.3) nextPage();
      else if (x > w * 0.7) prevPage();
    } else {
      if (x < w * 0.3) prevPage();
      else if (x > w * 0.7) nextPage();
    }
  }, [nextPage, prevPage, isRtl, mangaZoom]);

  if (!manga) return null;

  const pdfReady = manga.source_type !== "pdf" || loadedPages[mangaCurrentPage] != null;
  const showDoublePages = mangaViewMode === "double";

  const mainStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 200,
    background: "var(--bg)", display: "flex",
    flexDirection: "column", overflow: "hidden", userSelect: "none",
  };

  const imgStyle: React.CSSProperties = {
    maxWidth: "100%", maxHeight: "100%",
    objectFit: "contain",
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${mangaZoom})`,
    transformOrigin: "center",
    transition: isDragging ? "none" : "transform 0.2s ease",
    cursor: isDragging ? "grabbing" : "pointer",
  };

  const doublePages = useMemo(() => {
    if (!showDoublePages) return null;
    let l: number | null = null, r: number | null = null;
    if (mangaCurrentPage === 0) l = 0;
    else { l = mangaCurrentPage; r = mangaCurrentPage + 1; }
    if (l !== null && l >= totalPages) l = null;
    if (r !== null && r >= totalPages) r = null;
    if (l === null && r === null) r = totalPages - 1;
    return { left: l, right: r };
  }, [mangaCurrentPage, totalPages, showDoublePages]);

  return (
    <div ref={mainRef} style={mainStyle} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onClick={handleClick}>
      {/* Toolbar — PDF 加载时也始终可见返回按钮 */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 310,
        padding: "10px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between",
        background: toolbarVisible || !pdfReady ? "linear-gradient(180deg, var(--glass-bg) 60%, transparent)" : "transparent",
        backdropFilter: toolbarVisible || !pdfReady ? "blur(var(--glass-blur)) saturate(var(--glass-saturate))" : "none",
        borderBottom: toolbarVisible || !pdfReady ? "1px solid var(--border-glass)" : "1px solid transparent",
        transition: "opacity 0.35s ease",
        opacity: toolbarVisible || !pdfReady ? 1 : 0,
        pointerEvents: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" style={{ background: "none", border: "none", color: "var(--text)", fontSize: "1.2rem", cursor: "pointer", borderRadius: "var(--radius-md)", padding: "6px 14px", transition: "all 0.25s ease" }}
            onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = "rgba(var(--accent-rgb), 0.12)"; t.style.boxShadow = "0 0 20px rgba(var(--accent-rgb), 0.25)"; }}
            onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = "none"; t.style.boxShadow = "none"; }}
            onClick={(e) => { e.stopPropagation(); closeMangaReader(); }}>← 返回</button>
          <span style={{ fontFamily: "var(--font-title)", fontWeight: 500, fontSize: ".9rem" }}>{manga.title}</span>
          {currentSeriesIdx >= 0 && (
            <span style={{ fontSize: ".75rem", color: "var(--text-dim)", marginLeft: 4 }}>— {currentSeriesIdx + 1}/{seriesChapters.length}章</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {currentSeriesIdx >= 0 && (
            <>
              <button className="btn" style={{ fontSize: ".7rem", padding: "3px 8px" }} onClick={(e) => {
                e.stopPropagation();
                if (currentSeriesIdx > 0) {
                  const prev = seriesChapters[currentSeriesIdx - 1];
                  useStore.setState({ currentManga: prev, mangaCurrentPage: prev.current_page || 0 });
                  setLoadedPages({});
                  setMangaZoom(1);
                }
              }} disabled={currentSeriesIdx <= 0}>← 上一章</button>
              <button className="btn" style={{ fontSize: ".7rem", padding: "3px 8px" }} onClick={(e) => {
                e.stopPropagation();
                if (currentSeriesIdx < seriesChapters.length - 1) {
                  const next = seriesChapters[currentSeriesIdx + 1];
                  useStore.setState({ currentManga: next, mangaCurrentPage: next.current_page || 0 });
                  setLoadedPages({});
                  setMangaZoom(1);
                }
              }} disabled={currentSeriesIdx >= seriesChapters.length - 1}>下一章 →</button>
            </>
          )}
          <span style={{ fontSize: ".78rem", color: "var(--text)", fontWeight: 500, paddingRight: 4, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
            {mangaViewMode === "double" && doublePages
              ? `页 ${Math.min(doublePages.left ?? 99, doublePages.right ?? 99) + 1}-${Math.max(doublePages.left ?? 0, doublePages.right ?? 0) + 1} / ${totalPages}`
              : `页 ${mangaCurrentPage + 1} / ${totalPages}`}
          </span>
          {["single", "double", "scroll"].map((mode) => (
            <button key={mode} className="btn" style={{
              fontSize: ".72rem", padding: "4px 10px",
              background: mangaViewMode === mode ? "rgba(var(--accent-rgb),0.12)" : undefined,
              borderColor: mangaViewMode === mode ? "var(--accent)" : "transparent",
            }} onClick={(e) => { e.stopPropagation(); setMangaViewMode(mode as any); }}>
              {mode === "single" ? "单页" : mode === "double" ? "双页" : "滚动"}
            </button>
          ))}
          <button className="btn" style={{ fontSize: ".7rem", padding: "4px 8px" }} onClick={(e) => { e.stopPropagation(); setMangaZoom(Math.max(0.25, mangaZoom - 0.2)); }}>🔍-</button>
          <span style={{ fontSize: ".72rem", color: "var(--text-dim)", minWidth: 32, textAlign: "center" }}>{Math.round(mangaZoom * 100)}%</span>
          <button className="btn" style={{ fontSize: ".7rem", padding: "4px 8px" }} onClick={(e) => { e.stopPropagation(); setMangaZoom(Math.min(4, mangaZoom + 0.2)); }}>🔍+</button>
          <button className="btn" style={{ fontSize: ".72rem", padding: "4px 10px" }} onClick={async (e) => {
            e.stopPropagation();
            const newDir = isRtl ? "ltr" : "rtl";
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("update_comic_direction", { comicId: manga.id, direction: newDir });
              showTip(isRtl ? "已切换为从左到右" : "已切换为从右到左");
              useStore.setState({ currentManga: { ...manga, direction: newDir } });
            } catch {}
          }}>{isRtl ? "RTL" : "LTR"}</button>
        </div>
      </div>

      <div ref={scrollRef} style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        overflow: mangaViewMode === "scroll" ? "auto" : "hidden",
        cursor: mangaViewMode !== "scroll" && pdfReady ? "pointer" : "default",
      }}>
        {!pdfReady ? <div style={{ color: "var(--text-dim)", fontSize: ".9rem" }} />
        : mangaViewMode === "scroll" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "60px 0 40px", minHeight: totalPages * 600 }}>
            <div style={{ height: scrollVisibleRange.start * 600 }} />
            {Array.from({ length: scrollVisibleRange.end - scrollVisibleRange.start }, (_, idx) => {
              const pageIdx = scrollVisibleRange.start + idx;
              return <PageImg key={pageIdx} src={loadedPages[pageIdx]} style={{ maxWidth: "min(100%, " + (800 * mangaZoom) + "px)", width: "100%" }} />;
            })}
          </div>
        ) : mangaViewMode === "double" && doublePages ? (
          <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 0, padding: "0", flexDirection: isRtl ? "row-reverse" : "row", transform: `scale(${mangaZoom}) translate(${panOffset.x / mangaZoom}px, ${panOffset.y / mangaZoom}px)`, transformOrigin: "center", transition: isDragging ? "none" : "transform 0.2s ease", cursor: isDragging ? "grabbing" : "pointer" }}>
            {doublePages.left !== null && (
              <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: isRtl ? "flex-start" : "flex-end", overflow: "hidden" }}>
                <PageImg src={loadedPages[doublePages.left]} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            )}
            {doublePages.left !== null && doublePages.right !== null && (
              <div style={{ width: 1, height: "40%", background: "var(--border-glass)", borderRadius: 0, flexShrink: 0 }} />
            )}
            {doublePages.right !== null && (
              <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: isRtl ? "flex-end" : "flex-start", overflow: "hidden" }}>
                <PageImg src={loadedPages[doublePages.right]} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <PageImg src={loadedPages[mangaCurrentPage]} style={imgStyle} />
          </div>
        )}
      </div>

      {/* 漫画侧栏 — 鼠标靠近左边缘弹出，显示漫画库列表方便切换 */}
      <div style={{
        position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 320,
        transform: mangaSidebar ? "translateX(0)" : "translateX(-100%)",
        opacity: mangaSidebar ? 1 : 0,
        willChange: "transform",
        transition: "transform 0.45s cubic-bezier(0.22, 1.3, 0.36, 1), opacity 0.3s ease",
        display: "flex",
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
        borderRight: "1px solid var(--border-glass)",
      }} onMouseEnter={() => { clearTimeout(sideTimer.current); }} onMouseLeave={() => { setMangaSidebar(false); }} onWheel={(e) => e.stopPropagation()} data-sidebar>
        {/* 侧栏主体 */}
        <div style={{ width: 240, overflowY: "auto", padding: "14px 16px", color: "var(--text)", fontSize: ".85rem" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: ".9rem" }}>漫画库</div>
          <input
            placeholder="搜索漫画..."
            value={comicSearch}
            onChange={(e) => setComicSearch(e.target.value)}
            style={{
              width: "100%", padding: "5px 8px", fontSize: ".75rem", marginBottom: 8,
              background: "var(--glass-bg)", color: "var(--text)",
              border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)",
              outline: "none", boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sidebarComics.filter(c => !comicSearch || c.title.includes(comicSearch)).map((c, _, arr) => {
              if (!showAllSidebar && arr.indexOf(c) >= 30) return null;
              return (
              <div key={c.id} onClick={async () => {
                const targetPage = c.current_page || 0;
                setMangaSidebar(false);
                setMangaZoom(1);
                setPanOffset({ x: 0, y: 0 });
                setLoadedPages({});
                setMangaPage(targetPage);
                useStore.setState({ currentManga: c, mangaCurrentPage: targetPage });
              }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 8px", borderRadius: "var(--radius-sm)",
                  background: c.id === manga?.id ? "rgba(var(--accent-rgb),0.15)" : "transparent",
                  border: "1px solid transparent",
                  borderColor: c.id === manga?.id ? "rgba(var(--accent-rgb),0.2)" : "transparent",
                  boxShadow: c.id === manga?.id ? "0 0 14px rgba(var(--accent-rgb),0.12), inset 0 0 6px rgba(var(--accent-rgb),0.04)" : "none",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  const t = e.currentTarget;
                  t.style.background = c.id === manga?.id ? "rgba(var(--accent-rgb),0.2)" : "rgba(var(--accent-rgb),0.08)";
                  t.style.boxShadow = "0 0 18px rgba(var(--accent-rgb),0.2), inset 0 0 8px rgba(var(--accent-rgb),0.05)";
                  t.style.borderColor = "rgba(var(--accent-rgb),0.3)";
                }}
                onMouseLeave={(e) => {
                  const t = e.currentTarget;
                  t.style.background = c.id === manga?.id ? "rgba(var(--accent-rgb),0.15)" : "transparent";
                  t.style.boxShadow = c.id === manga?.id ? "0 0 14px rgba(var(--accent-rgb),0.12), inset 0 0 6px rgba(var(--accent-rgb),0.04)" : "none";
                  t.style.borderColor = c.id === manga?.id ? "rgba(var(--accent-rgb),0.2)" : "transparent";
                }}>
                <div style={{
                  width: 40, height: 50, borderRadius: 4, overflow: "hidden", flexShrink: 0,
                  position: "relative", background: "rgba(var(--accent-rgb),0.06)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.2rem",
                  border: "1px solid transparent",
                }}>
                  <SidebarCover comicId={c.id} />
                  {c.book_icon || getMangaIcon(c)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: ".78rem", color: c.id === manga?.id ? "var(--accent)" : "var(--text)", fontWeight: c.id === manga?.id ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                  <div style={{ width: "100%", height: 3, background: "rgba(var(--accent-rgb),0.1)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${c.total_pages > 0 ? ((c.id === manga?.id ? mangaCurrentPage : c.current_page) / c.total_pages) * 100 : 0}%`, height: "100%", background: c.id === manga?.id ? "var(--accent)" : "rgba(var(--accent-rgb),0.5)", borderRadius: 2, transition: "width 0.3s ease" }} />
                  </div>
                </div>
              </div>
              );
            })}
            {!showAllSidebar && (() => {
              const cnt = sidebarComics.filter(c => !comicSearch || c.title.includes(comicSearch)).length;
              if (cnt <= 30) return null;
              return <div onClick={() => setShowAllSidebar(true)} style={{ padding: "8px 8px", textAlign: "center", fontSize: ".78rem", color: "var(--accent)", cursor: "pointer", borderRadius: "var(--radius-sm)", transition: "all 0.2s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--accent-rgb),0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>显示全部 {cnt} 本</div>;
            })()}
          </div>
        </div>
      </div>

      {/* 侧栏把手 */}
      <SidebarHandle open={mangaSidebar} hint={sidebarHint}
        transition="left 0.45s cubic-bezier(0.22, 1.3, 0.36, 1), opacity 0.3s ease" />

      {loading && !loadedPages[mangaCurrentPage] ? (
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "var(--text-dim)", fontSize: ".85rem", zIndex: 220, background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-tip-blur))", padding: "8px 20px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-glass)", pointerEvents: "none" }}>加载中...</div>
      ) : null}

      {tip && (
        <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-tip-blur))", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-full)", padding: "10px 24px", fontSize: ".85rem", color: "var(--text)", zIndex: 500, animation: "tipIn 0.3s ease" }}>{tip}</div>
      )}
    </div>
  );
}

function SidebarCover({ comicId }: { comicId: string }) {
  const [cover, setCover] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const cached = localStorage.getItem(`nr-manga-cover-${comicId}`);
    if (cached) {
      if (cached.startsWith("data:")) {
        try { localStorage.removeItem(`nr-manga-cover-${comicId}`); } catch {}
      } else {
        setCover(cached);
        return;
      }
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
        const path: string = await invoke("get_comic_thumbnail", { comicId });
        if (path) {
          const url = convertFileSrc(path);
          setCover(url);
          try { localStorage.setItem(`nr-manga-cover-${comicId}`, url); } catch {}
        }
      } catch {}
    })();
  }, [comicId]);

  if (!cover) return null;
  return <img src={cover} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }} />;
}

function getPageUrl(manga: { image_dir: string; pages: { index: number; filename: string }[] }, pageIdx: number): string {
  const page = manga.pages.find(p => p.index === pageIdx);
  return page ? convertFileSrc(manga.image_dir + "\\" + page.filename) : "";
}

function PageImg({ src, style }: { src?: string; style: React.CSSProperties }) {
  if (!src) {
    return <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--accent-rgb),0.03)", borderRadius: 2, color: "var(--text-dim)", fontSize: ".75rem" }}>…</div>;
  }
  return <img src={src} alt="page" style={{ ...style, display: "block", borderRadius: 2 }} draggable={false} />;
}

function getMangaIcon(c: { book_icon?: string; source_type?: string }): string {
  if (c.book_icon) return c.book_icon;
  if (c.source_type === "pdf") return "📕";
  return "🎴";
}
