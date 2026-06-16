import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useStore } from "../store";

export default function MangaReader() {
  const currentManga = useStore((s) => s.currentManga);
  const mangaCurrentPage = useStore((s) => s.mangaCurrentPage);
  const setMangaPage = useStore((s) => s.setMangaPage);
  const closeMangaReader = useStore((s) => s.closeMangaReader);
  const mangaViewMode = useStore((s) => s.mangaViewMode);
  const setMangaViewMode = useStore((s) => s.setMangaViewMode);
  const mangaZoom = useStore((s) => s.mangaZoom);
  const setMangaZoom = useStore((s) => s.setMangaZoom);

  const manga = currentManga;
  const [loadedPages, setLoadedPages] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState("");
  const tipTimer = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navTimer = useRef<number>(0);
  const [toolbarVisible, setToolbarVisible] = useState(false);

  const isRtl = manga?.direction === "rtl";
  const totalPages = manga?.total_pages ?? 0;

  const showTip = useCallback((msg: string) => {
    clearTimeout(tipTimer.current);
    setTip(msg);
    tipTimer.current = window.setTimeout(() => setTip(""), 2000);
  }, []);

  useEffect(() => {
    return () => { clearTimeout(tipTimer.current); };
  }, []);

  useEffect(() => {
    if (!manga) return;
    if (mangaViewMode === "scroll") return; // 滚动模式用下面的 useEffect

    const preloadAhead = 10; // 向前预加载 10 页
    const preloadBehind = 2;  // 保留已翻过的 2 页
    const pagesToLoad: number[] = [];
    const start = Math.max(0, mangaCurrentPage - preloadBehind);
    const end = Math.min(totalPages - 1, mangaCurrentPage + preloadAhead);
    for (let i = start; i <= end; i++) {
      if (!loadedPages[i]) pagesToLoad.push(i);
    }
    if (pagesToLoad.length === 0) return;
    setLoading(true);
    let cancelled = false;
    const BATCH = 4;
    async function load() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const newPages: Record<number, string> = {};
        for (let i = 0; i < pagesToLoad.length; i += BATCH) {
          if (cancelled) return;
          const batch = pagesToLoad.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map((idx) => invoke("get_comic_page", { comicId: manga.id, pageIndex: idx }))
          );
          results.forEach((r, j) => {
            if (r.status === "fulfilled") newPages[batch[j]] = r.value as string;
          });
          setLoadedPages((prev) => ({ ...prev, ...newPages }));
        }
      } catch (e) {
        console.error("加载页面失败:", e);
        showTip("加载图片失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [manga?.id, mangaCurrentPage, mangaViewMode, totalPages]);

  // 滚动模式：按可见区域加载，限流防抖
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
        // 加载可视区 -2 屏 ~ +5 屏
        const estPageH = 600;
        const screenPages = Math.ceil(el.clientHeight / estPageH);
        const start = Math.max(0, Math.floor(viewTop / estPageH) - 2 * screenPages);
        const end = Math.min(totalPages - 1, Math.ceil(viewBottom / estPageH) + 5 * screenPages);
        const toLoad: number[] = [];
        for (let i = start; i <= end; i++) {
          if (!loadedPages[i]) toLoad.push(i);
        }
        if (toLoad.length === 0) return;
        const loadBatch = async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const BATCH = 4;
            const newPages: Record<number, string> = {};
            for (let i = 0; i < toLoad.length; i += BATCH) {
              const batch = toLoad.slice(i, i + BATCH);
              const results = await Promise.allSettled(
                batch.map((idx) => invoke("get_comic_page", { comicId: manga.id, pageIndex: idx }))
              );
              results.forEach((r, j) => {
                if (r.status === "fulfilled") newPages[batch[j]] = r.value as string;
              });
              setLoadedPages((prev) => ({ ...prev, ...newPages }));
            }
          } catch {}
        };
        loadBatch();
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
        case "+": case "=": e.preventDefault(); setMangaZoom(mangaZoom + 0.25); break;
        case "-": e.preventDefault(); setMangaZoom(mangaZoom - 0.25); break;
        case "Escape": closeMangaReader(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [manga, mangaCurrentPage, mangaZoom, isRtl]);

  const handleMouseMove = () => {
    clearTimeout(navTimer.current);
    setToolbarVisible(true);
    navTimer.current = window.setTimeout(() => setToolbarVisible(false), 2500);
  };

  const nextPage = useCallback(() => {
    if (!manga) return;
    if (mangaViewMode === "double") {
      const advance = mangaCurrentPage === 0 ? 1 : 2;
      const next = Math.min(totalPages - 1, mangaCurrentPage + advance);
      if (next === mangaCurrentPage) showTip("已经是最后一页");
      else setMangaPage(next);
    } else {
      if (mangaCurrentPage < totalPages - 1) setMangaPage(mangaCurrentPage + 1);
      else showTip("已经是最后一页");
    }
  }, [manga, mangaCurrentPage, mangaViewMode, totalPages]);

  const prevPage = useCallback(() => {
    if (!manga) return;
    if (mangaViewMode === "double") {
      const retreat = mangaCurrentPage <= 1 ? 1 : 2;
      const next = Math.max(0, mangaCurrentPage - retreat);
      if (next === mangaCurrentPage) showTip("已经是第一页");
      else setMangaPage(next);
    } else {
      if (mangaCurrentPage > 0) setMangaPage(mangaCurrentPage - 1);
      else showTip("已经是第一页");
    }
  }, [manga, mangaCurrentPage, mangaViewMode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (mangaViewMode === "scroll") return;
    e.preventDefault();
    if (e.deltaY > 0) nextPage(); else prevPage();
  }, [mangaViewMode, nextPage, prevPage]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w * 0.3) prevPage();
    else if (x > w * 0.7) nextPage();
  }, [nextPage, prevPage]);

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
    transform: `scale(${mangaZoom})`,
    transition: "transform 0.2s ease",
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
    <div style={mainStyle} onMouseMove={handleMouseMove} onWheel={handleWheel} onClick={handleClick}>
      {/* Toolbar — PDF 加载时也始终可见返回按钮 */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 310,
        padding: "10px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between",
        background: toolbarVisible || !pdfReady ? "linear-gradient(180deg, var(--glass-bg) 60%, transparent)" : "transparent",
        backdropFilter: toolbarVisible || !pdfReady ? "blur(24px) saturate(1.4)" : "none",
        borderBottom: toolbarVisible || !pdfReady ? "1px solid var(--border-glass)" : "1px solid transparent",
        transition: "opacity 0.35s ease",
        opacity: toolbarVisible || !pdfReady ? 1 : 0,
        pointerEvents: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" style={{ background: "none", border: "none", color: "var(--text)", fontSize: "1.2rem", cursor: "pointer", borderRadius: 10, padding: "6px 14px", transition: "all 0.25s ease" }}
            onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = "rgba(var(--accent-rgb), 0.12)"; t.style.boxShadow = "0 0 20px rgba(var(--accent-rgb), 0.25)"; }}
            onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = "none"; t.style.boxShadow = "none"; }}
            onClick={(e) => { e.stopPropagation(); closeMangaReader(); }}>← 返回</button>
          <span style={{ fontFamily: "Georgia,Noto Serif SC,serif", fontWeight: 500, fontSize: ".9rem" }}>{manga.title}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: ".78rem", color: "var(--text-dim)", paddingRight: 4 }}>
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
          <button className="btn" style={{ fontSize: ".7rem", padding: "4px 8px" }} onClick={(e) => { e.stopPropagation(); setMangaZoom(mangaZoom - 0.25); }}>🔍-</button>
          <span style={{ fontSize: ".72rem", color: "var(--text-dim)", minWidth: 32, textAlign: "center" }}>{Math.round(mangaZoom * 100)}%</span>
          <button className="btn" style={{ fontSize: ".7rem", padding: "4px 8px" }} onClick={(e) => { e.stopPropagation(); setMangaZoom(mangaZoom + 0.25); }}>🔍+</button>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "60px 0 40px" }}>
            {Array.from({ length: totalPages }, (_, idx) => (
              <PageImg key={idx} src={loadedPages[idx]} style={{ maxWidth: "min(100%, " + (800 * mangaZoom) + "px)", width: "100%" }} />
            ))}
          </div>
        ) : mangaViewMode === "double" && doublePages ? (
          <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 4, padding: "0 4px", flexDirection: isRtl ? "row-reverse" : "row" }}>
            {doublePages.left !== null && (
              <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <PageImg src={loadedPages[doublePages.left]} style={{ ...imgStyle, maxHeight: "calc(100vh - 80px)" }} />
              </div>
            )}
            {doublePages.left !== null && doublePages.right !== null && (
              <div style={{ width: 2, height: "60%", background: "var(--border-glass)", borderRadius: 1, flexShrink: 0 }} />
            )}
            {doublePages.right !== null && (
              <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <PageImg src={loadedPages[doublePages.right]} style={{ ...imgStyle, maxHeight: "calc(100vh - 80px)" }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <PageImg src={loadedPages[mangaCurrentPage]} style={imgStyle} />
          </div>
        )}
      </div>

      {loading && !loadedPages[mangaCurrentPage] ? (
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "var(--text-dim)", fontSize: ".85rem", zIndex: 220, background: "var(--glass-bg)", backdropFilter: "blur(12px)", padding: "8px 20px", borderRadius: 20, border: "1px solid var(--border-glass)", pointerEvents: "none" }}>加载中...</div>
      ) : null}

      {tip && (
        <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", background: "var(--glass-bg)", backdropFilter: "blur(20px)", border: "1px solid var(--border-glass)", borderRadius: 30, padding: "10px 24px", fontSize: ".85rem", color: "var(--text)", zIndex: 500, animation: "tipIn 0.3s ease" }}>{tip}</div>
      )}
    </div>
  );
}

function PageImg({ src, style }: { src?: string; style: React.CSSProperties }) {
  if (!src) {
    return <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--accent-rgb),0.03)", borderRadius: 2, color: "var(--text-dim)", fontSize: ".75rem" }}>…</div>;
  }
  return <img src={src} alt="page" style={{ ...style, display: "block", borderRadius: 2 }} draggable={false} />;
}
