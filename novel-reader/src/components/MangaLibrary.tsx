import React, { useEffect, useState, useRef, useMemo } from "react";
import { useStore, ComicData, ComicMeta } from "../store";
import { handleCardGlow } from "../utils/glow";
import { SelectCheckbox, FavStar, ProgressBar, ContextMenu, MenuItem, MenuDivider, BatchActionBar, BatchIconPicker, IconPicker, SortButton } from "./SharedUI";
import { FileIcon, FolderIcon, EditIcon, PaletteIcon, TrashIcon, CheckSquareIcon, ArrowRightIcon, RefreshIcon, BanIcon, ImageIcon, StarIcon } from "./FlatIcons";


export default function MangaLibrary() {
  const comics = useStore((s) => s.comics);
  const setComics = useStore((s) => s.setComics);
  const comicsMeta = useStore((s) => s.comicsMeta);
  const openMangaReader = useStore((s) => s.openMangaReader);
  const comicRefreshKey = useStore((s) => s.comicRefreshKey);
  const setSeriesMap = useStore((s) => s.setSeriesMap);
  const seriesMap = useStore((s) => s.seriesMap);
  const [seriesTarget, setSeriesTarget] = useState<ComicData | null>(null);
  const [seriesCtx, setSeriesCtx] = useState<{ name: string; x: number; y: number } | null>(null);
  const [activeSeries, setActiveSeries] = useState<string>("全部");
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({});
  const [ctxMenu, setCtxMenu] = useState<{ comic: ComicData; x: number; y: number } | null>(null);
  const [iconPicker, setIconPicker] = useState<ComicData | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ComicData | null>(null);
  const [renameCardRect, setRenameCardRect] = useState<DOMRect | null>(null);
  type SortField = "name" | "pages" | "favorite";
  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem("nr-manga-sort-field");
    if (saved === "pages" || saved === "favorite") return saved;
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
        series_id: c.series_id, last_read_at: c.last_read_at,
      }))
    : comicsMeta;

  const [displayList, setDisplayList] = useState<ComicMeta[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke("sort_comics", { field: sortField, asc: sortAsc, meta: rawList });
        if (!cancelled) setDisplayList(result as ComicMeta[]);
      } catch {
        // fallback to frontend sort
        if (!cancelled) {
          const list = rawList.slice();
          list.sort((a, b) => {
            let cmp = 0;
            if (sortField === "name") cmp = a.title.localeCompare(b.title, "zh-CN");
            else if (sortField === "pages") cmp = a.total_pages - b.total_pages;
            else if (sortField === "favorite") {
              const aFav = (a.favorite ? 0 : 1);
              const bFav = (b.favorite ? 0 : 1);
              cmp = aFav - bFav || a.title.localeCompare(b.title, "zh-CN");
            }
            return sortAsc ? cmp : -cmp;
          });
          setDisplayList(list);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rawList, sortField, sortAsc]);

  // 系列标签
  const seriesTabs = useMemo(() => {
    return ["全部", "最近阅读", ...Object.keys(seriesMap)];
  }, [seriesMap]);

  // 每个系列各自维护一份过滤后的列表，保证 DOM 稳定
  const seriesLists = useMemo(() => {
    const map: Record<string, ComicMeta[]> = {};
    for (const name of seriesTabs) {
      if (name === "全部") map[name] = displayList;
      else if (name === "最近阅读") {
        map[name] = displayList
          .filter((c) => c.last_read_at != null)
          .sort((a, b) => (b.last_read_at ?? 0) - (a.last_read_at ?? 0));
      } else {
        const sids = seriesMap[name] || [];
        map[name] = displayList.filter((c) => sids.includes(c.id));
      }
    }
    return map;
  }, [seriesTabs, seriesMap, displayList]);

  const handleDeleteSeries = (seriesName: string, deleteFiles: boolean) => {
    setSeriesCtx(null);
    const ids = seriesMap[seriesName] || [];
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        for (const id of ids) {
          await invoke("remove_comic", { comicId: id, deleteFile: deleteFiles });
        }
        const { [seriesName]: _, ...rest } = seriesMap;
        setSeriesMap(rest);
        triggerRefresh();
      } catch {}
    })();
  };

  // 当前选中的系列被删除时自动回到"全部"
  useEffect(() => {
    if (activeSeries !== "全部" && activeSeries !== "最近阅读" && !seriesMap[activeSeries]) {
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
        setComics(enriched);
      } catch {
        if (!cancelled) setComics([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [comicRefreshKey]);

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
          const { triggerComicRefresh } = useStore.getState();
          triggerComicRefresh();
        });
      } catch {}
    })();
    return () => { unlisten?.(); };
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
  }, []);

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

  // 点击/滚轮关闭右键菜单
  useEffect(() => {
    const handler = () => { setCtxMenu(null); setSeriesCtx(null); };
    window.addEventListener("click", handler);
    window.addEventListener("wheel", handler, { passive: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("wheel", handler);
    };
  }, []);

  const triggerRefresh = () => {
    const { triggerComicRefresh, triggerRefresh } = useStore.getState();
    triggerComicRefresh();
    if (triggerRefresh) triggerRefresh();
  };

  const handleOpenPath = async (comic: ComicData) => {
    setCtxMenu(null);
    if (!comic.source_path) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_file_location", { path: comic.source_path });
    } catch {}
  };

  const handleRename = (comic: ComicData) => {
    setCtxMenu(null);
    setRenameTarget(comic);
    const cardEl = document.getElementById(`manga-card-${comic.id}`);
    const rect = cardEl?.getBoundingClientRect();
    if (rect) setRenameCardRect(rect);
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
    setBatchIconPicker(false);
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
  const [batchSeriesOpen, setBatchSeriesOpen] = useState(false);

  const handleBatchAddToSeries = (seriesName: string) => {
    if (!seriesName) return;
    const existing = seriesMap[seriesName] || [];
    const newIds = [...selectedIds].filter(id => !existing.includes(id));
    if (newIds.length > 0) {
      setSeriesMap({ ...seriesMap, [seriesName]: [...existing, ...newIds] });
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setBatchSeriesOpen(false);
    triggerRefresh();
  };

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

  if (displayList.length === 0) {
    return (
      <section className="library">
        <div className="library-header">
          <h1 className="library-title">漫画库</h1>
          <span className="library-count">0 本漫画</span>
        </div>
        <div className="empty-state">
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
        <div id="series-tabs" className="glow-border glow-inner" style={{
          display: "flex", gap: 0, cursor: "pointer", userSelect: "none",
          background: "rgba(var(--accent-rgb),0.06)",
          borderRadius: "var(--radius-md)", padding: 3,
          position: "relative",
          maxWidth: 500, flexShrink: 1, minWidth: 0,
          overflow: "visible",
        }}
          onMouseMove={(e) => {
            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();
            el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
            el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
          }}
        >
          <div style={{
            position: "absolute", top: 3, bottom: 3,
            background: "rgba(var(--accent-rgb),0.18)",
            borderRadius: "var(--radius-md)",
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
                onContextMenu={(e) => {
                  if (name === "全部" || name === "最近阅读") return;
                  e.preventDefault();
                  setSeriesCtx({ name, x: e.clientX, y: e.clientY });
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
        {(["name", "pages", "favorite"] as const).map((field) => (
          <SortButton key={field}
            field={field}
            label={field === "name" ? "名称" : field === "pages" ? "页数" : <><StarIcon size={14} style={{verticalAlign:'middle'}} /> 收藏</>}
            currentField={sortField}
            asc={sortAsc}
            onClick={() => setSort(field)}
          />
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
                const fromStore = useStore.getState().comics.find(c => c.id === comic.id);
                if (fromStore) openMangaReader(fromStore);
              };
              return (
              <div
                key={comic.id}
                id={`manga-card-${comic.id}`}
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
                {selectMode && <SelectCheckbox selected={selectedIds.has(comic.id)} />}
                <div className={`book-cover${selectedIds.has(comic.id) ? " cover-selected" : ""}`}>
                  <FavStar show={!!(optimisticFav[comic.id] ?? comic.favorite)} bursting={bursting.has(comic.id)} />
                  <MangaCardCover comicId={comic.id} hasIcon={!!comic.book_icon} />
                  <div className="book-cover-icon">{comic.book_icon}</div>
                  <div className="book-title">{comic.title}</div>
                  <ProgressBar pct={comic.total_pages > 0 ? (comic.current_page / comic.total_pages) * 100 : 0} />
                  <div style={{ fontSize: ".68rem", color: "var(--text-dim)", marginTop: 2, textAlign: "center" }}>
                    {comic.current_page + 1}/{comic.total_pages} 页
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
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} minWidth={200}>
          <MenuItem icon={<EditIcon />} label="重命名" onClick={() => handleRename(ctxMenu.comic)} />
          <MenuItem icon={<PaletteIcon />} label="选择封面图标" onClick={() => { setCtxMenu(null); setIconPicker(ctxMenu.comic); }} />
          <MenuItem icon={<StarIcon size={14} />} label={(optimisticFav[ctxMenu.comic.id] ?? ctxMenu.comic.favorite) ? "取消收藏" : "添加收藏"} onClick={() => handleToggleFavorite(ctxMenu.comic)} />
          <MenuDivider />
          <MenuItem icon={<FolderIcon />} label="打开文件位置" onClick={() => handleOpenPath(ctxMenu.comic)} />
          <MenuDivider />
          <MenuItem icon={<ArrowRightIcon style={{ transform: ctxMenu.comic.direction === "rtl" ? "rotateY(180deg)" : "none" }} />} label={`阅读方向: ${ctxMenu.comic.direction === "rtl" ? "从右到左" : "从左到右"}`} onClick={() => handleSetDirection(ctxMenu.comic, ctxMenu.comic.direction === "rtl" ? "ltr" : "rtl")} />
          {ctxMenu.comic.source_type === "folder" && (
            <MenuItem icon={<RefreshIcon />} label="重新扫描文件夹" onClick={() => handleRescan(ctxMenu.comic)} />
          )}
          <MenuItem icon={<TrashIcon />} label="删除" onClick={() => handleDelete(ctxMenu.comic)} />
          <MenuDivider />
          <MenuItem icon={<FileIcon />} label="添加到系列" onClick={() => { setCtxMenu(null); setSeriesTarget(ctxMenu.comic); }} />
          {activeSeries !== "全部" ? (
            <MenuItem icon={<BanIcon />} label={`从「${activeSeries}」移出`} onClick={() => {
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
            <MenuItem icon={<BanIcon />} label={`从系列移出`} onClick={() => {
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
          <MenuItem icon={<CheckSquareIcon />} label="批量功能" onClick={() => { setCtxMenu(null); setSelectMode(true); setSelectedIds(new Set()); }} />
        </ContextMenu>
      )}

      {seriesCtx && (
        <ContextMenu x={seriesCtx.x} y={seriesCtx.y} minWidth={220}>
          <div style={{ padding: "8px 16px", fontSize: ".78rem", color: "var(--text-dim)", borderBottom: "1px solid var(--border-glass)", marginBottom: 4 }}>
            系列：{seriesCtx.name}
          </div>
          <MenuDivider />
          <MenuItem icon={<TrashIcon />} label="仅删除文件夹（保留漫画）" onClick={() => handleDeleteSeries(seriesCtx.name, false)} />
          <MenuItem icon={<TrashIcon />} label="删除文件夹及里面所有漫画" onClick={() => {
            setSeriesCtx(null);
            if (confirm(`确定要删除系列「${seriesCtx.name}」及其包含的所有漫画吗？此操作不可恢复。`)) {
              handleDeleteSeries(seriesCtx.name, true);
            }
          }} danger />
        </ContextMenu>
      )}

      {/* 批量操作栏 */}
      {selectMode && (
        <BatchActionBar
          total={(seriesLists[activeSeries] || []).length}
          selectedCount={selectedIds.size}
          onToggleSelectAll={() => {
            const list = seriesLists[activeSeries] || [];
            if (selectedIds.size === list.length) {
              setSelectedIds(new Set());
            } else {
              setSelectedIds(new Set(list.map(b => b.id)));
            }
          }}
          onCancel={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          onFavorite={handleBatchFavorite}
          onIcon={() => setBatchIconPicker(true)}
          onAddToSeries={() => setBatchSeriesOpen(true)}
          onDelete={handleBatchDelete}
        />
      )}

      {batchIconPicker && (
        <BatchIconPicker
          count={selectedIds.size}
          iconList={ICON_LIST}
          onSelectIcon={handleBatchIcon}
          onClose={() => setBatchIconPicker(false)}
          inputId="batch-icon-input"
          extra={
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".78rem", justifyContent: "center", padding: "6px 0" }}
                onClick={() => { handleBatchIcon(""); handleClearCoverCache(selectedIds); }}>
                <ImageIcon size={16} style={{ verticalAlign: "middle", marginRight: 4 }} /> 原封面
              </button>
            </div>
          }
        />
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
                <ImageIcon size={16} style={{ verticalAlign: "middle", marginRight: 4 }} /> 原封面
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

      {/* 批量添加到系列弹窗 */}
      {batchSeriesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBatchSeriesOpen(false)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 8, textAlign: "center" }}>批量添加到系列（{selectedIds.size} 项）</div>
            <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 16, textAlign: "center" }}>输入系列名称或选择已有系列</div>
            <input id="batch-series-input" placeholder="输入系列名称..." style={{ width: "100%", boxSizing: "border-box", background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: ".85rem", outline: "none", marginBottom: 12 }}
              onKeyDown={(e) => { if (e.key === "Enter") handleBatchAddToSeries((document.getElementById("batch-series-input") as HTMLInputElement)?.value?.trim() || ""); }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn" style={{ flex: 1, fontSize: ".8rem", justifyContent: "center" }} onClick={() => setBatchSeriesOpen(false)}>取消</button>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: ".8rem", justifyContent: "center" }} onClick={() => handleBatchAddToSeries((document.getElementById("batch-series-input") as HTMLInputElement)?.value?.trim() || "")}>确定</button>
            </div>
            {Object.keys(seriesMap).length > 0 && (
              <><div style={{ height: 1, background: "var(--border-glass)", margin: "8px 0" }} />
              <div style={{ fontSize: ".85rem", fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>已有系列</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(seriesMap).map(([name, ids]) => (
                  <span key={name} onClick={() => handleBatchAddToSeries(name)}
                    style={{ fontSize: ".78rem", cursor: "pointer", padding: "4px 10px", borderRadius: "var(--radius-sm)", background: "rgba(var(--accent-rgb),0.08)", border: "1px solid rgba(var(--accent-rgb),0.15)", color: "var(--text)" }}>
                    {name} ({ids.length})
                  </span>
                ))}
              </div></>
            )}
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

      {/* 重命名弹窗 — 变形动画 */}
      {renameTarget && renameCardRect && (
        <MangaRenameMorphDialog
          comic={renameTarget}
          cardRect={renameCardRect}
          onClose={() => { setRenameTarget(null); setRenameCardRect(null); }}
          onRefresh={triggerRefresh}
        />
      )}
    </section>
  );
}

/** 漫画重命名弹窗 — 书卡→弹窗变形动画 + 封面毛玻璃背景 */
function MangaRenameMorphDialog({ comic, cardRect, onClose, onRefresh }: { comic: ComicData; cardRect: DOMRect; onClose: () => void; onRefresh: () => void }) {
  const [phase, setPhase] = useState<"start" | "open" | "closing">("start");
  const inputRef = useRef<HTMLInputElement>(null);
  const alreadyRef = useRef(false);
  const [titleStyle, setTitleStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    // 读取书名计算样式
    const cardEl = document.getElementById(`manga-card-${comic.id}`);
    const titleEl = cardEl?.querySelector('.book-title') as HTMLElement | null;
    if (titleEl) {
      const cs = getComputedStyle(titleEl);
      setTitleStyle({
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
      });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { setPhase("open"); });
    });
  }, []);

  const targetW = 360;
  const targetH = 260;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  const handleClose = () => {
    setPhase("closing");
    setTimeout(onClose, 320);
  };

  const handleSubmit = () => {
    if (alreadyRef.current) return;
    alreadyRef.current = true;
    const newName = inputRef.current?.value?.trim();
    if (!newName || newName === comic.title) { handleClose(); return; }
    setPhase("closing");
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("rename_comic", { comicId: comic.id, newTitle: newName });
        setTimeout(onClose, 200);
        onRefresh();
      } catch { alreadyRef.current = false; setPhase("open"); }
    })();
  };

  return (
    <>
      {/* 遮罩层 */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 9997,
        background: phase === "open" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
        backdropFilter: phase === "open" ? "blur(3px)" : "blur(0)",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease",
        pointerEvents: phase === "open" ? "auto" : "none",
      }} onClick={handleClose} />

      {/* 主弹窗容器 — backdrop-filter 直接挂在容器上，用 left/top/width/height 做变形动画 */}
      <div style={{
        position: "fixed", zIndex: 9999,
        left: phase === "start" || phase === "closing" ? cardRect.left : cx - targetW / 2,
        top: phase === "start" || phase === "closing" ? cardRect.top : cy - targetH / 2,
        width: phase === "start" || phase === "closing" ? cardRect.width : targetW,
        height: phase === "start" || phase === "closing" ? cardRect.height : targetH,
        borderRadius: "var(--radius-lg)",
        opacity: phase === "closing" ? 0 : 1,
        filter: phase === "closing" ? "blur(8px)" : "blur(0)",
        transition: "left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, filter 0.3s ease",
        background: "rgba(22, 18, 16, 0.45)",
        backdropFilter: "blur(var(--glass-blur, 32px)) saturate(var(--glass-saturate, 1.5))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 32px)) saturate(var(--glass-saturate, 1.5))",
        border: "1px solid var(--border-glass)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>
        {/* 封面层 */}
        <MangaRenameCover comicId={comic.id} cardRect={cardRect} phase={phase} />
        {/* 弹窗内容 */}
        <div style={{
          position: "relative", zIndex: 1,
          opacity: phase === "open" ? 1 : 0,
          transition: "opacity 0.2s ease",
          transitionDelay: phase === "open" ? "0.18s" : "0s",
          width: "100%",
        }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 8, textAlign: "center" }}>重命名</div>
          <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 16, textAlign: "center" }}>
            将「<span style={titleStyle}>{comic.title}</span>」重命名为
          </div>
          <input ref={inputRef} defaultValue={comic.title} autoFocus
            style={{ width: "100%", boxSizing: "border-box", background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: ".9rem", outline: "none", marginBottom: 16 }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ flex: 1, fontSize: ".85rem", justifyContent: "center" }} onClick={handleClose}>取消</button>
            <button className="btn btn-primary" style={{ flex: 1, fontSize: ".85rem", justifyContent: "center" }} onClick={handleSubmit}>确定</button>
          </div>
        </div>
      </div>
    </>
  );
}

function MangaRenameCover({ comicId, cardRect, phase }: { comicId: string; cardRect: DOMRect; phase: string }) {
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "start") return;
    (async () => {
      try {
        const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
        const path: string = await invoke("get_comic_thumbnail", { comicId });
        if (path) setCover(convertFileSrc(path));
      } catch {}
    })();
  }, [comicId, phase]);

  if (!cover) return null;

  return (
    <>
      <img src={cover} alt="" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", zIndex: 0, opacity: 0.35,
        borderRadius: "var(--radius-lg)",
      }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "rgba(22, 18, 16, 0.6)",
        backdropFilter: "blur(8px) saturate(1)",
        WebkitBackdropFilter: "blur(8px) saturate(1)",
        borderRadius: "var(--radius-lg)",
      }} />
    </>
  );
}

// 模块级封面内存缓存（组件卸载后保留，切换系列标签时无需重新加载）
// LRU 上限 100 条，防止无限增长
const COVER_CACHE_MAX = 100;
const coverCache = new Map<string, string>();

function coverCacheGet(id: string): string | undefined {
  const val = coverCache.get(id);
  if (val !== undefined) {
    // 重新插入以更新访问顺序（LRU）
    coverCache.delete(id);
    coverCache.set(id, val);
  }
  return val;
}
function coverCacheSet(id: string, val: string) {
  if (coverCache.has(id)) coverCache.delete(id);
  else if (coverCache.size >= COVER_CACHE_MAX) {
    // Map 按插入顺序迭代，删最早一条
    const firstKey = coverCache.keys().next().value;
    if (firstKey !== undefined) coverCache.delete(firstKey);
  }
  coverCache.set(id, val);
}

function MangaCardCover({ comicId, hasIcon }: { comicId: string; hasIcon: boolean }) {
  const [cover, setCover] = useState<string | null>(() => {
    if (hasIcon) return null;
    return coverCacheGet(comicId) ?? null;
  });
  const ref = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(coverCache.has(comicId));

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
      // 迁移：旧缓存是 data:image 的 base64，删除后让新代码重新获取 URL
      if (cached.startsWith("data:")) {
        try { localStorage.removeItem(`nr-manga-cover-${comicId}`); } catch {}
      } else {
        coverCacheSet(comicId, cached);
        setCover(cached);
        loadedRef.current = true;
        return;
      }
    }

    // 缓存已清除（选了原封面），直接加载不等待 IntersectionObserver
    const loadCover = async () => {
      loadedRef.current = true;
      try {
        const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
        const path: string = await invoke("get_comic_thumbnail", { comicId });
        if (path) {
          const url = convertFileSrc(path);
          coverCacheSet(comicId, url);
          setCover(url);
          try { localStorage.setItem(`nr-manga-cover-${comicId}`, url); } catch {}
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
        <img className="book-cover-img" src={cover} alt="" />
        <div className="book-cover-gradient" />
      </>
    );
  }

  return <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />;
}
