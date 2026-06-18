import React, { useEffect, useState, useRef, useMemo } from "react";
import { useStore, ComicData, ComicMeta } from "../store";

export default function MangaLibrary() {
  const comics = useStore((s) => s.comics);
  const setComics = useStore((s) => s.setComics);
  const comicsMeta = useStore((s) => s.comicsMeta);
  const setComicsMeta = useStore((s) => s.setComicsMeta);
  const openMangaReader = useStore((s) => s.openMangaReader);
  const refreshKey = useStore((s) => s.refreshKey);
  const setSeriesMap = useStore((s) => s.setSeriesMap);
  const seriesMap = useStore((s) => s.seriesMap);
  const [seriesTarget, setSeriesTarget] = useState<ComicData | null>(null);
  const [activeSeries, setActiveSeries] = useState<string>("全部");
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({});
  const [animStars, setAnimStars] = useState<Record<string, boolean>>({});

  const [ctxMenu, setCtxMenu] = useState<{ comic: ComicData; x: number; y: number } | null>(null);
  const [iconPicker, setIconPicker] = useState<ComicData | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleLockRef = useRef<Set<string>>(new Set());
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ComicData | null>(null);
  type SortField = "name" | "pages";
  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem("nr-manga-sort-field");
    if (saved === "pages") return "pages";
    localStorage.setItem("nr-manga-sort-field", "name");
    return "name";
  });
  const [sortAsc, setSortAsc] = useState(() => localStorage.getItem("nr-manga-sort-asc") !== "false");

  const setSort = (field: SortField) => {
    if (sortField === field) {
      const next = !sortAsc;
      setSortAsc(next);
      localStorage.setItem("nr-manga-sort-asc", String(next));
    } else {
      setSortField(field);
      localStorage.setItem("nr-manga-sort-field", field);
      localStorage.setItem("nr-manga-sort-asc", "true");
      setSortAsc(true);
    }
  };

  const ICON_LIST = ["📚", "🎴", "🗾", "⛩️", "🌸", "⚔️", "🦊", "👹", "🌀", "🌊", "🔥", "🖼️", "🎨", "📦", "⭐"];

  // 优先用 full data，否则用 localStorage meta；二者都空时先展示一个 loading 状态
  const rawList: ComicMeta[] = comics.length > 0
    ? comics.map((c): ComicMeta => ({
        id: c.id, title: c.title, source_type: c.source_type,
        total_pages: c.total_pages, current_page: c.current_page,
        direction: c.direction, favorite: c.favorite, book_icon: c.book_icon,
        series_id: c.series_id,
      }))
    : comicsMeta;

  const displayList = useMemo(() => {
    const list = rawList.slice();
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.title.localeCompare(b.title, "zh-CN");
      else if (sortField === "pages") cmp = a.total_pages - b.total_pages;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [rawList, sortField, sortAsc]);

  // 系列标签
  const seriesTabs = useMemo(() => {
    return ["全部", ...Object.keys(seriesMap)];
  }, [seriesMap]);

  // 每个系列各自维护一份过滤后的列表，保证 DOM 稳定
  const seriesLists = useMemo(() => {
    const map: Record<string, ComicMeta[]> = {};
    for (const name of seriesTabs) {
      if (name === "全部") map[name] = displayList;
      else {
        const sids = seriesMap[name] || [];
        map[name] = displayList.filter((c) => sids.includes(c.id));
      }
    }
    return map;
  }, [seriesTabs, seriesMap, displayList]);

  // 当前选中的系列被删除时自动回到"全部"
  useEffect(() => {
    if (activeSeries !== "全部" && !seriesMap[activeSeries]) {
      setActiveSeries("全部");
    }
  }, [activeSeries, seriesMap]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const lib: ComicData[] = await invoke("get_comic_library");
        if (cancelled) return;
        const seriesReverse: Record<string, string> = {};
        for (const [sn, ids] of Object.entries(seriesMap)) {
          for (const id of ids) seriesReverse[id] = sn;
        }
        const enriched = lib.map((c) => ({ ...c, series_id: c.series_id || seriesReverse[c.id] || undefined }));
        const meta = enriched.map((c): ComicMeta => ({ id: c.id, title: c.title, source_type: c.source_type, total_pages: c.total_pages, current_page: c.current_page, direction: c.direction, favorite: c.favorite, book_icon: c.book_icon, series_id: c.series_id }));
        setComics(enriched); setComicsMeta(meta);
      } catch {
        if (!cancelled) setComics([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const el = document.getElementById("series-tabs");
    if (!el) return;
    const activeEl = el.querySelector(`[data-tab="${activeSeries}"]`) as HTMLElement | null;
    if (!activeEl) return;
    const parent = el.getBoundingClientRect();
    const rect = activeEl.getBoundingClientRect();
    setSliderStyle({ left: rect.left - parent.left, width: rect.width });
  }, [activeSeries, seriesMap]);

  // 监听 comics-refreshed 事件，渲染完成一本就刷新漫画库
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("comics-refreshed", async () => {
          const { triggerRefresh } = useStore.getState();
          triggerRefresh();
        });
      } catch {}
    })();
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // Escape 退出批量模式
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectMode) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  const handleCardGlow = (e: React.MouseEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
    el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
  };

  const handleCtxMenu = (e: React.MouseEvent, comic: ComicMeta) => {
    e.preventDefault();
    e.stopPropagation();
    const full = comics.find(c => c.id === comic.id);
    const latest = full || useStore.getState().comics.find(c => c.id === comic.id);
    const comicData = latest || comic;
    // 估算菜单高度 ~460px，防止底部超出窗口
    const menuH = 460;
    const viewH = window.innerHeight;
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = e.clientY + menuH > viewH ? Math.max(8, viewH - menuH - 8) : e.clientY;
    setCtxMenu({ comic: comicData as any, x, y });
  };

  const triggerRefresh = () => {
    const { triggerRefresh } = useStore.getState();
    triggerRefresh();
  };

  const handleOpenPath = async (comic: ComicData) => {
    setCtxMenu(null);
    if (!comic.source_path) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_file_location", { path: comic.source_path });
    } catch {}
  };

  const handleRename = async (comic: ComicData) => {
    setCtxMenu(null);
    setRenameTarget(comic);
  };

  const [optimisticFav, setOptimisticFav] = useState<Record<string, boolean>>({});
  const [bursting, setBursting] = useState<Set<string>>(new Set());

  const handleToggleFavorite = async (comic: ComicData) => {
    setCtxMenu(null);
    const bid = comic.id;
    const currentFav = optimisticFav[bid] ?? comic.favorite;

    if (currentFav) {
      setBursting((prev) => new Set(prev).add(bid));
      await new Promise((r) => setTimeout(r, 500));
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_comic_favorite", { comicId: bid });
      } catch {}
      setOptimisticFav((prev) => ({ ...prev, [bid]: false }));
      setBursting((prev) => { const n = new Set(prev); n.delete(bid); return n; });
      triggerRefresh();
    } else {
      setOptimisticFav((prev) => ({ ...prev, [bid]: true }));
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_comic_favorite", { comicId: bid });
        triggerRefresh();
      } catch {
        setOptimisticFav((prev) => ({ ...prev, [bid]: false }));
      }
    }
  };

  const handleDelete = async (comic: ComicData) => {
    setCtxMenu(null);
    if (!confirm(`确定要删除「${comic.title}」吗？`)) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_comic", { comicId: comic.id });
      triggerRefresh();
    } catch {}
  };

  // 清除封面缓存（选中项）
  const handleClearCoverCache = (ids: Set<string>) => {
    ids.forEach((id) => {
      try { localStorage.removeItem(`nr-manga-cover-${id}`); } catch {}
    });
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`确定要删除选中的 ${count} 本漫画吗？`)) return;
    setCtxMenu(null);
    setSelectMode(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const id of selectedIds) {
        await invoke("remove_comic", { comicId: id }).catch(() => {});
      }
      setSelectedIds(new Set());
      triggerRefresh();
    } catch {}
  };

  // 批量收藏
  const handleBatchFavorite = async () => {
    if (selectedIds.size === 0) return;
    setCtxMenu(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const favs: Record<string, boolean> = {};
      const comicsData = useStore.getState().comics;
      const anyUnfav = Array.from(selectedIds).some(id => {
        const c = comicsData.find(b => b.id === id);
        return !c || !(optimisticFav[id] ?? c.favorite);
      });
      const newFav = anyUnfav;
      for (const id of selectedIds) {
        favs[id] = newFav;
        const c = comicsData.find(b => b.id === id);
        if ((optimisticFav[id] ?? c?.favorite) !== newFav) {
          await invoke("toggle_comic_favorite", { comicId: id }).catch(() => {});
        }
      }
      setOptimisticFav((prev) => ({ ...prev, ...favs }));
      setSelectedIds(new Set());
      setSelectMode(false);
      triggerRefresh();
    } catch {}
  };

  // 批量设置封面图标
  const handleBatchIcon = async (icon: string) => {
    if (selectedIds.size === 0) return;
    setBatchIconPicker(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const id of selectedIds) {
        await invoke("set_comic_icon", { comicId: id, icon }).catch(() => {});
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      triggerRefresh();
    } catch {}
  };

  const [batchIconPicker, setBatchIconPicker] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSetDirection = async (comic: ComicData, dir: string) => {
    setCtxMenu(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_comic_direction", { comicId: comic.id, direction: dir });
      triggerRefresh();
    } catch {}
  };

  const handleRescan = async (comic: ComicData) => {
    setCtxMenu(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const count = await invoke("rescan_comic_folder", { comicId: comic.id });
      triggerRefresh();
      alert(`已重新扫描，共 ${count} 页`);
    } catch (e) {
      console.error("重新扫描失败:", e);
    }
  };

  if (displayList.length === 0 && seriesTabs.length <= 1) {
    return (
      <section className="library">
        <div className="library-header">
          <h1 className="library-title">漫画库</h1>
          <span className="library-count">0 本漫画</span>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🎴</div>
          <div className="empty-title">还没有漫画</div>
          <div className="empty-desc">点击右上角的"导入漫画"按钮，添加你的漫画吧！支持 CBZ/ZIP、PDF、图片文件夹</div>
        </div>
      </section>
    );
  }

  return (
    <section className="library">
      <div className="library-header">
        <h1 className="library-title">漫画库</h1>
        <span className="library-count">{displayList.length} 本漫画</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div id="series-tabs" style={{
          display: "flex", gap: 0, cursor: "pointer", userSelect: "none",
          background: "rgba(var(--accent-rgb),0.06)",
          borderRadius: "var(--radius-sm)", padding: 3,
          position: "relative",
          maxWidth: 500, flexShrink: 1, minWidth: 0,
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 3, bottom: 3,
            background: "rgba(var(--accent-rgb),0.18)",
            borderRadius: "var(--radius-sm)",
            transform: "translateZ(0)",
            willChange: "left, width",
            transition: "left 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), width 0.4s cubic-bezier(0.22, 0.61, 0.36, 1)",
            zIndex: 0, ...sliderStyle,
          }} />
          {seriesTabs.map((name) => {
            const tabCount = seriesLists[name]?.length || 0;
            return (
              <span key={name} data-tab={name}
                onClick={() => {
                  if (name === activeSeries) return;
                  setActiveSeries(name);
                }}
                style={{
                  fontSize: ".78rem", padding: "5px 14px", position: "relative", zIndex: 1,
                  fontWeight: activeSeries === name ? 600 : 400,
                  color: activeSeries === name ? "var(--text)" : "var(--text-dim)",
                  transition: "color 0.3s ease",
                  flexShrink: 0, whiteSpace: "nowrap", cursor: "pointer",
                }}
              >{name} ({tabCount})</span>
            );
          })}
          <span style={{ fontSize: ".78rem", padding: "5px 14px", flexShrink: 0, color: "var(--accent)", cursor: "pointer", fontWeight: 500, position: "relative", zIndex: 1 }}
            onClick={() => setSeriesDialogOpen(true)}>+ 新建</span>
        </div>
        {(["name", "pages"] as const).map((field) => (
          <button key={field} className="btn" onClick={() => setSort(field)} style={{
            fontSize: ".78rem", padding: "4px 12px",
            background: sortField === field ? "rgba(var(--accent-rgb),0.1)" : undefined,
            borderColor: sortField === field ? "var(--accent)" : undefined,
          }}>
            {field === "name" ? "📄 名称" : "📄 页数"}
            {sortField === field && (sortAsc ? " ↑" : " ↓")}
          </button>
        ))}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr",
      }}>
        {seriesTabs.map((name) => (
          <div key={name} style={{
            gridArea: "1 / 1",
            opacity: activeSeries === name ? 1 : 0,
            pointerEvents: activeSeries === name ? "auto" : "none",
            transition: "opacity 0.4s ease",
          }}>
            <div className="book-grid">
            {seriesLists[name]?.map((comic) => {
              // 点击时如果 Full data 已加载则直接用 full data；否则即时加载
              const handleOpen = async () => {
                setCtxMenu(null);
                const t1 = performance.now();
                const full = comics.find(c => c.id === comic.id);
                if (full) {
                  const t2 = performance.now();
                  console.log(`[perf] handleOpen: comics.find 耗时 ${(t2 - t1).toFixed(1)}ms`);
                  openMangaReader(full);
                  return;
                }
                // lazy load single comic
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  const lib: ComicData[] = await invoke("get_comic_library");
                  const t3 = performance.now();
                  console.log(`[perf] handleOpen: get_comic_library 耗时 ${(t3 - t1).toFixed(1)}ms`);
                  const found = lib.find(c => c.id === comic.id);
                  if (found) openMangaReader(found);
                } catch {}
              };
              return (
              <div
                key={comic.id}
                className="book-card"
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(comic.id);
                  } else {
                    handleOpen();
                  }
                }}
                onContextMenu={(e) => handleCtxMenu(e, comic)}
                onMouseMove={(e) => handleCardGlow(e, e.currentTarget)}
              >
                {selectMode && (
                  <div style={{
                    position: "absolute", top: 8, left: 8, zIndex: 10,
                    width: 24, height: 24, borderRadius: "var(--radius-sm)",
                    border: selectedIds.has(comic.id) ? "2px solid var(--accent)" : "2px solid rgba(var(--accent-rgb),0.25)",
                    background: selectedIds.has(comic.id) ? "var(--accent)" : "rgba(0,0,0,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ".75rem", color: "#fff", fontWeight: 700,
                    pointerEvents: "none", backdropFilter: "blur(var(--glass-mask-blur))",
                  }}>
                    {selectedIds.has(comic.id) ? "✓" : ""}
                  </div>
                )}
                <div className={`book-cover${selectedIds.has(comic.id) ? " cover-selected" : ""}`}>
                  {((optimisticFav[comic.id] ?? comic.favorite)) && <span style={{ position: "absolute", top: 6, right: 8, fontSize: "1.1rem", zIndex: 4, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))", pointerEvents: "none", animation: bursting.has(comic.id) ? "starBurst 0.5s ease forwards" : "starPop 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) both" }}>⭐</span>}
                  <MangaCardCover comicId={comic.id} hasIcon={!!comic.book_icon} />
                  <div className="book-cover-icon">{comic.book_icon || getMangaIcon(comic)}</div>
                  <div className="book-title">{comic.title}</div>
                  <div className="book-progress">
                    <div className="book-progress-bar" style={{ width: `${comic.total_pages > 0 ? (comic.current_page / comic.total_pages) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="book-info">
                  <div className="book-chapter">
                    {comic.current_page > 0
                      ? `第${comic.current_page + 1}/${comic.total_pages}页`
                      : `${comic.total_pages}页`}
                  </div>
                </div>
              </div>
              );
            })}
            </div>
          </div>
        ))}
      </div>

      {ctxMenu && (
        <div
          style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 300,
            background: "var(--surface-glass, var(--glass-bg))",
            backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
            border: "1px solid var(--border-glass)",
            borderRadius: "var(--radius-md)",
            padding: "6px 0",
            minWidth: 200,
            boxShadow: "0 8px 40px var(--shadow)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxMenuItem icon="✏️" label="重命名" onClick={() => handleRename(ctxMenu.comic)} />
          <CtxMenuItem icon="🎨" label="选择封面图标" onClick={() => { setCtxMenu(null); setIconPicker(ctxMenu.comic); }} />
          <CtxMenuItem icon="⭐" label={(optimisticFav[ctxMenu.comic.id] ?? ctxMenu.comic.favorite) ? "取消收藏" : "添加收藏"} onClick={() => handleToggleFavorite(ctxMenu.comic)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <CtxMenuItem icon="📂" label="打开文件位置" onClick={() => handleOpenPath(ctxMenu.comic)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <CtxMenuItem icon="➡️" label={`阅读方向: ${ctxMenu.comic.direction === "rtl" ? "从右到左" : "从左到右"}`} onClick={() => handleSetDirection(ctxMenu.comic, ctxMenu.comic.direction === "rtl" ? "ltr" : "rtl")} />
          {ctxMenu.comic.source_type === "folder" && (
            <CtxMenuItem icon="🔄" label="重新扫描文件夹" onClick={() => handleRescan(ctxMenu.comic)} />
          )}
          <CtxMenuItem icon="🗑️" label="删除" onClick={() => handleDelete(ctxMenu.comic)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <CtxMenuItem icon="📑" label="添加到系列" onClick={() => { setCtxMenu(null); setSeriesTarget(ctxMenu.comic); }} />
          {activeSeries !== "全部" ? (
            <CtxMenuItem icon="🚫" label={`从「${activeSeries}」移出`} onClick={() => {
              setCtxMenu(null);
              const cur = seriesMap[activeSeries] || [];
              const filtered = cur.filter((id: string) => id !== ctxMenu.comic.id);
              if (filtered.length === 0) {
                const { [activeSeries]: _, ...rest } = seriesMap;
                setSeriesMap(rest);
              } else {
                setSeriesMap({ ...seriesMap, [activeSeries]: filtered });
              }
              triggerRefresh();
            }} />
          ) : ctxMenu.comic.series_id && (
            <CtxMenuItem icon="🚫" label={`从系列移出`} onClick={() => {
              setCtxMenu(null);
              const sid = ctxMenu.comic.series_id!;
              const cur = seriesMap[sid] || [];
              const filtered = cur.filter((id: string) => id !== ctxMenu.comic.id);
              if (filtered.length === 0) {
                const { [sid]: _, ...rest } = seriesMap;
                setSeriesMap(rest);
              } else {
                setSeriesMap({ ...seriesMap, [sid]: filtered });
              }
              triggerRefresh();
            }} />
          )}
          <CtxMenuItem icon="☑️" label="批量功能" onClick={() => { setCtxMenu(null); setSelectMode(true); setSelectedIds(new Set()); }} />
        </div>
      )}

      {/* 批量操作栏 */}
      {selectMode && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 500,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          padding: "12px 24px",
          background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
          borderTop: "1px solid var(--border-glass)",
        }}>
          <span style={{ color: "var(--text-dim)", fontSize: ".8rem" }}>已选 {selectedIds.size} 项</span>
          <button className="btn" style={{ fontSize: ".8rem" }} onClick={() => {
            const list = seriesLists[activeSeries] || [];
            if (selectedIds.size === list.length) {
              setSelectedIds(new Set());
            } else {
              setSelectedIds(new Set(list.map(b => b.id)));
            }
          }}>{selectedIds.size === (seriesLists[activeSeries]?.length || 0) ? "取消全选" : "全选"}</button>
          <button className="btn" style={{ fontSize: ".8rem" }} onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>取消</button>
          <button className="btn" style={{ fontSize: ".8rem" }} disabled={selectedIds.size === 0} onClick={handleBatchFavorite}>⭐ 收藏所选</button>
          <button className="btn" style={{ fontSize: ".8rem" }} disabled={selectedIds.size === 0} onClick={() => setBatchIconPicker(true)}>🎨 图标</button>
          <button className="btn btn-primary" style={{ fontSize: ".8rem", background: selectedIds.size === 0 ? undefined : "rgba(200,60,50,0.8)" }} disabled={selectedIds.size === 0} onClick={handleBatchDelete}>
            🗑️ 删除所选
          </button>
        </div>
      )}

      {/* 批量图标选择器 */}
      {batchIconPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBatchIconPicker(false)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>批量设置封面图标（{selectedIds.size} 项）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {ICON_LIST.map((ic) => (
                <span key={ic} onClick={() => handleBatchIcon(ic)}
                  style={{ fontSize: "1.6rem", cursor: "pointer", padding: 6, borderRadius: "var(--radius-sm)", border: "1px solid transparent", transition: "all 0.15s ease" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--accent-rgb),0.12)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >{ic}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".78rem", justifyContent: "center", padding: "6px 0" }} onClick={() => { handleBatchIcon(""); handleClearCoverCache(selectedIds); }}>
                🖼️ 原封面
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="batch-icon-input" placeholder="或输入自定义 emoji..." style={{ flex: 1, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleBatchIcon((document.getElementById("batch-icon-input") as HTMLInputElement)?.value || ""); }}
              />
              <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: ".82rem" }} onClick={() => handleBatchIcon((document.getElementById("batch-icon-input") as HTMLInputElement)?.value || "")}>确定</button>
            </div>
          </div>
        </div>
      )}

      {iconPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setIconPicker(null)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>选择封面图标</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {ICON_LIST.map((ic) => (
                <span key={ic} onClick={() => setIconPicker({ ...iconPicker, book_icon: ic })}
                  style={{ fontSize: "1.6rem", cursor: "pointer", padding: 6, borderRadius: "var(--radius-sm)", background: iconPicker.book_icon === ic ? "rgba(var(--accent-rgb),0.12)" : "transparent", border: iconPicker.book_icon === ic ? "1px solid var(--accent)" : "1px solid transparent" }}>{ic}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".78rem", justifyContent: "center", padding: "6px 0" }}
                onClick={async () => {
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("set_comic_icon", { comicId: iconPicker.id, icon: "" });
                    try { localStorage.removeItem(`nr-manga-cover-${iconPicker.id}`); } catch {}
                    setIconPicker(null);
                    triggerRefresh();
                  } catch {}
                }}>
                🖼️ 原封面
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={iconPicker.book_icon || ""} onChange={(e) => setIconPicker({ ...iconPicker, book_icon: e.target.value })} placeholder="或输入自定义 emoji..." style={{ flex: 1, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center" }} />
              <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: ".82rem" }} onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  const icon = iconPicker.book_icon || "";
                  await invoke("set_comic_icon", { comicId: iconPicker.id, icon });
                  if (!icon) {
                    // 选原封面时清除缓存，下次显示真实封面
                    try { localStorage.removeItem(`nr-manga-cover-${iconPicker.id}`); } catch {}
                  }
                  setIconPicker(null);
                  triggerRefresh();
                } catch {}
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 系列弹窗 */}
      {seriesTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSeriesTarget(null)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 8, textAlign: "center" }}>添加到系列</div>
            <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 16, textAlign: "center" }}>将「{seriesTarget.title}」添加到系列</div>
            <input id="series-name-input" defaultValue={(seriesTarget as any).series_id || ""} placeholder="输入系列名称..." style={{ width: "100%", boxSizing: "border-box", background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: ".85rem", outline: "none", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".8rem", justifyContent: "center" }} onClick={() => setSeriesTarget(null)}>取消</button>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: ".8rem", justifyContent: "center" }} onClick={() => {
                const inp = document.getElementById("series-name-input") as HTMLInputElement;
                const name = inp?.value?.trim(); if (!name) return;
                const existing = seriesMap[name] || [];
                if (!existing.includes(seriesTarget.id)) {
                  setSeriesMap({ ...seriesMap, [name]: [...existing, seriesTarget.id] });
                }
                setSeriesTarget(null); triggerRefresh();
              }}>确定</button>
            </div>
            {Object.keys(seriesMap).length > 0 && (
              <><div style={{ height: 1, background: "var(--border-glass)", margin: "8px 0" }} />
              <div style={{ fontSize: ".85rem", fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>已有系列</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(seriesMap).map(([name, ids]) => (
                  <span key={name} onClick={() => {
                    if (!ids.includes(seriesTarget.id)) {
                      setSeriesMap({ ...seriesMap, [name]: [...ids, seriesTarget.id] });
                    }
                    setSeriesTarget(null); triggerRefresh();
                  }} style={{ fontSize: ".78rem", cursor: "pointer", padding: "4px 10px", borderRadius: "var(--radius-sm)", background: "rgba(var(--accent-rgb),0.08)", border: "1px solid rgba(var(--accent-rgb),0.15)", color: "var(--text)" }}>
                    {name} ({ids.length})
                  </span>
                ))}
              </div></>
            )}
          </div>
        </div>
      )}

      {/* 新建系列弹窗 */}
      {seriesDialogOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSeriesDialogOpen(false)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 360, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>新建系列</div>
            <input id="new-series-input" placeholder="输入系列名称..." autoFocus style={{ width: "100%", boxSizing: "border-box", background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: ".9rem", outline: "none", marginBottom: 16 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const inp = document.getElementById("new-series-input") as HTMLInputElement;
                  const name = inp?.value?.trim();
                  if (!name) return;
                  if (seriesMap[name]) { alert("系列已存在"); return; }
                  setSeriesMap({ ...seriesMap, [name]: [] });
                  setActiveSeries(name);
                  setSeriesDialogOpen(false);
                }
              }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".85rem", justifyContent: "center" }} onClick={() => setSeriesDialogOpen(false)}>取消</button>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: ".85rem", justifyContent: "center" }} onClick={() => {
                const inp = document.getElementById("new-series-input") as HTMLInputElement;
                const name = inp?.value?.trim();
                if (!name) return;
                if (seriesMap[name]) { alert("系列已存在"); return; }
                setSeriesMap({ ...seriesMap, [name]: [] });
                setActiveSeries(name);
                setSeriesDialogOpen(false);
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setRenameTarget(null)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 360, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 8, textAlign: "center" }}>重命名</div>
            <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 16, textAlign: "center" }}>将「{renameTarget.title}」重命名为</div>
            <input id="rename-input" defaultValue={renameTarget.title} autoFocus style={{ width: "100%", boxSizing: "border-box", background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: ".9rem", outline: "none", marginBottom: 16 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const inp = document.getElementById("rename-input") as HTMLInputElement;
                  const newName = inp?.value?.trim();
                  if (!newName || newName === renameTarget.title) { setRenameTarget(null); return; }
                  (async () => {
                    try {
                      const { invoke } = await import("@tauri-apps/api/core");
                      await invoke("rename_comic", { comicId: renameTarget.id, newTitle: newName });
                      setRenameTarget(null);
                      triggerRefresh();
                    } catch {}
                  })();
                }
              }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".85rem", justifyContent: "center" }} onClick={() => setRenameTarget(null)}>取消</button>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: ".85rem", justifyContent: "center" }} onClick={() => {
                const inp = document.getElementById("rename-input") as HTMLInputElement;
                const newName = inp?.value?.trim();
                if (!newName || newName === renameTarget.title) { setRenameTarget(null); return; }
                (async () => {
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("rename_comic", { comicId: renameTarget.id, newTitle: newName });
                    setRenameTarget(null);
                    triggerRefresh();
                  } catch {}
                })();
              }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// 模块级封面内存缓存：组件卸载后保留，切换系列标签时无需重新加载
const coverCache = new Map<string, string>();

function MangaCardCover({ comicId, hasIcon }: { comicId: string; hasIcon: boolean }) {
  // 从内存缓存取封面，标记是否为缓存命中（避免重新挂载时触发 coverFadeIn 动画）
  const fromCache = coverCache.has(comicId);
  const [cover, setCover] = useState<string | null>(() => {
    if (hasIcon) return null;
    return coverCache.get(comicId) ?? null;
  });
  const ref = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(fromCache);

  useEffect(() => {
    // 用户设置了 emoji 图标时，不显示第一页封面
    if (hasIcon) {
      setCover(null);
      return;
    }

    // 内存中已有缓存，无需任何操作
    if (coverCache.has(comicId)) {
      loadedRef.current = true;
      return;
    }

    // 先查 localStorage（浏览器重启后的持久化缓存）
    const cached = localStorage.getItem(`nr-manga-cover-${comicId}`);
    if (cached) {
      coverCache.set(comicId, cached);
      setCover(cached);
      loadedRef.current = true;
      return;
    }

    // 缓存已清除（选了原封面），直接加载不等待 IntersectionObserver
    const loadCover = async () => {
      loadedRef.current = true;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const b64: string = await invoke("get_comic_thumbnail", { comicId });
        if (b64) {
          coverCache.set(comicId, b64);
          setCover(b64);
          try { localStorage.setItem(`nr-manga-cover-${comicId}`, b64); } catch {}
        }
      } catch {}
    };

    if (loadedRef.current) {
      loadCover();
      return;
    }

    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadedRef.current) {
          loadedRef.current = true;
          obs.disconnect();
          loadCover();
        }
      },
      { rootMargin: "200px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [comicId, hasIcon]);

  if (cover) {
    return (
      <>
        <img className="book-cover-img" src={cover} alt="" style={fromCache ? { animation: "none" } : undefined} />
        <div className="book-cover-gradient" />
      </>
    );
  }

  // 不渲染占位 div，等进入视口才加载
  return <div ref={ref} style={{ position: "absolute", inset: 0, zIndex: 1 }} />;
}

function CtxMenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        fontSize: ".9rem",
        color: hover ? "var(--accent)" : "var(--text)",
        background: hover ? "rgba(var(--accent-rgb),0.06)" : "transparent",
        transition: "all 0.15s ease",
      }}
    >
      <span style={{ fontSize: "1rem" }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function sourceTypeLabel(t: string): string {
  switch (t) {
    case "cbz": return "CBZ";
    case "pdf": return "PDF";
    case "folder": return "📁";
    default: return t;
  }
}

function getMangaIcon(comic: ComicMeta): string {
  if (comic.book_icon) return comic.book_icon;
  if (comic.source_type === "pdf") return "📕";
  const icons: Record<string, string> = { "海贼王": "🏴‍☠️", "火影忍者": "🍥", "鬼灭之刃": "⚔️", "进击的巨人": "🧱", "咒术回战": "🌀", "龙珠": "🐉", "名侦探柯南": "🔍", "灌篮高手": "🏀", "死神": "⚔️" };
  return icons[comic.title] || "🎴";
}
