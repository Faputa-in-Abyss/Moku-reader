import React, { useEffect, useState, useRef, useMemo } from "react";
import { useStore, BookData } from "../store";

export default function Library() {
  const books = useStore((s) => s.books);
  const setBooks = useStore((s) => s.setBooks);
  const openReader = useStore((s) => s.openReader);
  const refreshKey = useStore((s) => s.refreshKey);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [ctxMenu, setCtxMenu] = useState<{ book: BookData; x: number; y: number } | null>(null);
  const [iconPicker, setIconPicker] = useState<BookData | null>(null);
  const [batchIconPicker, setBatchIconPicker] = useState(false);
  const [animStars, setAnimStars] = useState<Record<string, boolean>>({});
  const animRef = useRef<number>(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type SortField = "name" | "progress" | "chapters";
  const [sortField, setSortField] = useState<SortField>(() => (localStorage.getItem("nr-novel-sort-field") as SortField) || "name");
  const [sortAsc, setSortAsc] = useState(() => localStorage.getItem("nr-novel-sort-asc") !== "false");

  const setSort = (field: SortField) => {
    if (sortField === field) {
      const next = !sortAsc;
      setSortAsc(next);
      localStorage.setItem("nr-novel-sort-asc", String(next));
    } else {
      setSortField(field);
      localStorage.setItem("nr-novel-sort-field", field);
      localStorage.setItem("nr-novel-sort-asc", "true");
      setSortAsc(true);
    }
  };

  const sortedBooks = useMemo(() => {
    const list = books.slice();
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.title.localeCompare(b.title, "zh-CN");
      else if (sortField === "progress") cmp = a.progress - b.progress;
      else if (sortField === "chapters") cmp = a.total_chapters - b.total_chapters;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [books, sortField, sortAsc]);

  const ICON_LIST = ["📖", "☯", "🕯", "🌌", "🎮", "⭐", "🔥", "⚔️", "🛡️", "🏔️", "🌊", "🌸", "👻", "🤖", "🧙"];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const lib: BookData[] = await invoke("get_library");
        if (!cancelled) setBooks(lib);
      } catch {
        if (!cancelled) setBooks(sampleBooks);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // 点击其他地方关闭菜单
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const handleCardGlow = (e: React.MouseEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
    el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
  };

  const handleCtxMenu = (e: React.MouseEvent, book: BookData) => {
    e.preventDefault();
    e.stopPropagation();
    // 保存最新 book 引用
    const latest = useStore.getState().books.find(b => b.id === book.id) || book;
    setCtxMenu({ book: latest, x: e.clientX, y: e.clientY });
  };

  const handleRename = async (book: BookData) => {
    setCtxMenu(null);
    const newName = prompt("请输入新书名：", book.title);
    if (!newName || newName === book.title) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("rename_book", { bookId: book.id, newTitle: newName });
      triggerRefresh();
    } catch {}
  };

  // 乐观更新的收藏状态：覆盖 server 状态，立即生效
  const [optimisticFav, setOptimisticFav] = useState<Record<string, boolean>>({});
  // 正在消散的书籍：取消收藏时星星先播 starBurst，延时后才真的移除
  const [bursting, setBursting] = useState<Set<string>>(new Set());

  const handleToggleFavorite = async (book: BookData) => {
    setCtxMenu(null);
    const bid = book.id;
    // 用 optimistic 判断实际状态：如果 optimistic 存在则用它，否则用 book.favorite
    const currentFav = optimisticFav[bid] ?? book.favorite;

    if (currentFav) {
      // 取消收藏：立即标记 bursting，星星播 starBurst 消散动画
      setBursting((prev) => new Set(prev).add(bid));
      await new Promise((r) => setTimeout(r, 500));
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_favorite", { bookId: bid });
      } catch {}
      setOptimisticFav((prev) => ({ ...prev, [bid]: false }));
      setBursting((prev) => { const n = new Set(prev); n.delete(bid); return n; });
      triggerRefresh();
    } else {
      // 添加收藏：立即乐观显示星星
      setOptimisticFav((prev) => ({ ...prev, [bid]: true }));
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_favorite", { bookId: bid });
        triggerRefresh();
      } catch {
        setOptimisticFav((prev) => ({ ...prev, [bid]: false }));
      }
    }
  };
  const handleDelete = async (book: BookData) => {
    setCtxMenu(null);
    if (!confirm(`确定要删除「${book.title}」吗？`)) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_book", { bookId: book.id });
      triggerRefresh();
    } catch {}
  };

  const handleOpenPath = async (book: BookData) => {
    setCtxMenu(null);
    if (!book.file_path) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_file_location", { path: book.file_path });
    } catch {}
  };

  const handleReparse = async (book: BookData) => {
    setCtxMenu(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reparse_book_chapters", { bookId: book.id });
      triggerRefresh();
    } catch (e) {
      console.error("重新解析失败:", e);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`确定要删除选中的 ${count} 本书吗？`)) return;
    setCtxMenu(null);
    setSelectMode(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const id of selectedIds) {
        await invoke("remove_book", { bookId: id }).catch(() => {});
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
      const booksData = useStore.getState().books;
      // 先判断是否有未收藏的，有则全部收藏，否则全部取消收藏
      const anyUnfav = Array.from(selectedIds).some(id => {
        const b = booksData.find(b => b.id === id);
        return !b || !(optimisticFav[id] ?? b.favorite);
      });
      const newFav = anyUnfav;
      for (const id of selectedIds) {
        favs[id] = newFav;
        // 每个都 toggle 到目标状态
        const b = booksData.find(b => b.id === id);
        if ((optimisticFav[id] ?? b?.favorite) !== newFav) {
          await invoke("toggle_favorite", { bookId: id }).catch(() => {});
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
        await invoke("set_book_icon", { bookId: id, icon }).catch(() => {});
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      triggerRefresh();
    } catch {}
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (books.length === 0) {
    return (
      <section className="library">
        <div className="library-header">
          <h1 className="library-title">我的书库</h1>
          <span className="library-count">0 本书</span>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <div className="empty-title">还没有书</div>
          <div className="empty-desc">点击右上角的"导入小说"按钮，添加你的第一本小说吧</div>
        </div>
      </section>
    );
  }

  return (
    <section className="library">
      <div className="library-header">
        <h1 className="library-title">我的书库</h1>
        <span className="library-count">{books.length} 本书</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {(["name", "progress", "chapters"] as const).map((field) => (
          <button key={field} className="btn" onClick={() => setSort(field)} style={{
            fontSize: ".78rem", padding: "4px 12px",
            background: sortField === field ? "rgba(var(--accent-rgb),0.1)" : undefined,
            borderColor: sortField === field ? "var(--accent)" : undefined,
          }}>
            {field === "name" ? "📄 名称" : field === "progress" ? "📊 进度" : "📑 章节"}
            {sortField === field && (sortAsc ? " ↑" : " ↓")}
          </button>
        ))}
      </div>
      <div className="book-grid">
        {sortedBooks.map((book) => (
            <div
              key={book.id}
              className="book-card"
              onClick={() => {
                if (selectMode) {
                  toggleSelect(book.id);
                } else {
                  openReader(book);
                }
              }}
              onContextMenu={(e) => handleCtxMenu(e, book)}
              onMouseMove={(e) => handleCardGlow(e, e.currentTarget)}
            >
              {selectMode && (
                <div style={{
                  position: "absolute", top: 8, left: 8, zIndex: 10,
                  width: 24, height: 24, borderRadius: "var(--radius-sm)",
                  border: selectedIds.has(book.id) ? "2px solid var(--accent)" : "2px solid rgba(var(--accent-rgb),0.25)",
                  background: selectedIds.has(book.id) ? "var(--accent)" : "rgba(0,0,0,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: ".75rem", color: "#fff", fontWeight: 700,
                  pointerEvents: "none", backdropFilter: "blur(var(--glass-mask-blur))",
                }}>
                  {selectedIds.has(book.id) ? "✓" : ""}
                </div>
              )}
              <div className={`book-cover${selectedIds.has(book.id) ? " cover-selected" : ""}`}>
                {((optimisticFav[book.id] ?? book.favorite)) && <span style={{ position: "absolute", top: 6, right: 8, fontSize: "1.1rem", zIndex: 2, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))", pointerEvents: "none", animation: bursting.has(book.id) ? "starBurst 0.5s ease forwards" : "starPop 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) both" }}>⭐</span>}
                <div className="book-cover-icon">{book.book_icon || getBookIcon(book.title)}</div>
                <div className="book-title">{book.title}</div>
                <div className="book-progress">
                  <div className="book-progress-bar" style={{ width: `${book.progress * 100}%` }} />
                </div>
              </div>
              <div className="book-info">
                <div className="book-chapter">
                  {book.current_chapter > 0 ? `第${book.current_chapter}章` : "尚未阅读"}
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* 批量操作栏 */}
      {selectMode && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 500,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          padding: "12px 24px",
          background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur)) saturate(var(--glas