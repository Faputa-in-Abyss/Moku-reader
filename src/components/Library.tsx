import React, { useEffect, useState, useRef } from "react";
import { useStore, BookData } from "../store";
import { handleCardGlow } from "../utils/glow";

export default function Library() {
  const books = useStore((s) => s.books);
  const setBooks = useStore((s) => s.setBooks);
  const openReader = useStore((s) => s.openReader);
  const refreshKey = useStore((s) => s.refreshKey);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [ctxMenu, setCtxMenu] = useState<{ book: BookData; x: number; y: number } | null>(null);
  const [iconPicker, setIconPicker] = useState<BookData | null>(null);
  const [renameTarget, setRenameTarget] = useState<BookData | null>(null);
  const [renameCardRect, setRenameCardRect] = useState<DOMRect | null>(null);
  const [batchIconPicker, setBatchIconPicker] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type SortField = "name" | "progress" | "favorite";
  // D1: Add runtime validation for sortField from localStorage
  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem("nr-novel-sort-field");
    if (saved === "name" || saved === "progress" || saved === "favorite") return saved;
    return "name";
  });
  const [sortAsc, setSortAsc] = useState(() => localStorage.getItem("nr-novel-sort-asc") !== "false");
  const [bookSearch, setBookSearch] = useState("");

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

  const [sortedBooks, setSortedBooks] = useState<BookData[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke("sort_books", { field: sortField, asc: sortAsc });
        if (!cancelled) {
          const list = result as BookData[];
          const filtered = list.filter(b => !bookSearch || b.title.includes(bookSearch));
          setSortedBooks(filtered);
        }
      } catch {
        // fallback to frontend sort
        if (!cancelled) {
          const list = books.slice();
          list.sort((a, b) => {
            let cmp = 0;
            if (sortField === "name") cmp = a.title.localeCompare(b.title, "zh-CN");
            else if (sortField === "progress") cmp = a.progress - b.progress;
            else if (sortField === "favorite") {
              const aFav = (a.favorite ? 0 : 1);
              const bFav = (b.favorite ? 0 : 1);
              cmp = aFav - bFav || a.title.localeCompare(b.title, "zh-CN");
            }
            return sortAsc ? cmp : -cmp;
          });
          const filtered = list.filter(b => !bookSearch || b.title.includes(bookSearch));
          setSortedBooks(filtered);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [books, sortField, sortAsc, bookSearch]);

  const ICON_LIST = ["📖", "☯", "🕯", "🌌", "🎮", "⭐", "🔥", "⚔️", "🛡️", "🏔️", "🌊", "🌸", "👻", "🤖", "🧙"];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const lib: BookData[] = await invoke("get_library");
        if (!cancelled) setBooks(lib);
      } catch {
        if (!cancelled) {
          console.warn("get_library 失败，保留现有数据");
        }
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

  const handleCtxMenu = (e: React.MouseEvent, book: BookData) => {
    e.preventDefault();
    e.stopPropagation();
    // 保存最新 book 引用
    const latest = useStore.getState().books.find(b => b.id === book.id) || book;
    // 估算菜单高度 ~460px，防止底部超出窗口
    const menuH = 460;
    const viewH = window.innerHeight;
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = e.clientY + menuH > viewH ? Math.max(8, viewH - menuH - 8) : e.clientY;
    setCtxMenu({ book: latest, x, y });
  };

  const handleRename = (book: BookData) => {
    setCtxMenu(null);
    // 从 DOM 获取书卡的实时位置和尺寸
    const cardEl = document.getElementById(`lib-card-${book.id}`);
    const titleEl = cardEl?.querySelector('.book-title') as HTMLElement | null;
    const rect = cardEl?.getBoundingClientRect();
    if (rect) setRenameCardRect(rect);
    setRenameTarget(book);
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
  // NOTE: 乐观更新 (optimisticFav) 在批量操作中与后端状态可能短暂脱节。
  // 逐本 toggle 时，前一本已完成但后一本还没开始，optimisticFav 并未反映中间态。
  // 这是乐观更新的已知 tradeoff：如果某本书在批量执行期间被外部修改，
  // 最终 optimisticFav 可能落后于真实服务端状态，触发 refresh 后会重新同步。
  // D3: Read fresh state before each toggle to reduce inconsistency window
  const handleBatchFavorite = async () => {
    if (selectedIds.size === 0) return;
    setCtxMenu(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const favs: Record<string, boolean> = {};
      // 逐本处理时每次都从 store 读最新 books
      const anyUnfav = Array.from(selectedIds).some(id => {
        const b = useStore.getState().books.find(b => b.id === id);
        return !b || !(optimisticFav[id] ?? b.favorite);
      });
      const newFav = anyUnfav;
      for (const id of selectedIds) {
        favs[id] = newFav;
        const b = useStore.getState().books.find(b => b.id === id);
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

  // 区分书库为空和搜索无结果
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

  // 搜索无结果：保留搜索栏和排序按钮，显示"未找到"
  if (sortedBooks.length === 0 && bookSearch.trim()) {
    return (
      <section className="library">
        <div className="library-header">
          <h1 className="library-title">我的书库</h1>
          <span className="library-count">{books.length} 本书</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          {(["name", "progress", "favorite"] as const).map((field) => (
            <button key={field} className="btn sort-btn glow-border glow-inner" onClick={() => setSort(field)} style={{
              fontSize: ".78rem", padding: "4px 12px",
              background: sortField === field ? "rgba(var(--accent-rgb),0.1)" : undefined,
              borderColor: sortField === field ? "var(--accent)" : undefined,
            }}
              onMouseMove={(e) => {
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
                el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
              }}
            >
              {field === "name" ? "📄 名称" : field === "progress" ? "📊 进度" : "⭐ 收藏"}
              {sortField === field && (sortAsc ? " ↑" : " ↓")}
            </button>
          ))}
          <SearchInput value={bookSearch} onChange={setBookSearch} />
        </div>
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">未找到匹配书籍</div>
          <div className="empty-desc">没有书名包含「{bookSearch}」的书籍，试试其他关键词</div>
        </div>
      </section>
    );
  }

  return (
    <section className="library">
      <div className="library-header">
        <h1 className="library-title">我的书库</h1>
        <span className="library-count">{sortedBooks.length} 本书</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {(["name", "progress", "favorite"] as const).map((field) => (
          <button key={field} className="btn sort-btn glow-border glow-inner" onClick={() => setSort(field)} style={{
            fontSize: ".78rem", padding: "4px 12px",
            background: sortField === field ? "rgba(var(--accent-rgb),0.1)" : undefined,
            borderColor: sortField === field ? "var(--accent)" : undefined,
          }}
            onMouseMove={(e) => {
              const el = e.currentTarget;
              const rect = el.getBoundingClientRect();
              el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
              el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
            }}
          >
            {field === "name" ? "📄 名称" : field === "progress" ? "📊 进度" : "⭐ 收藏"}
            {sortField === field && (sortAsc ? " ↑" : " ↓")}
          </button>
        ))}
        <SearchInput value={bookSearch} onChange={setBookSearch} />
      </div>
      <div className="book-grid">
        {sortedBooks.map((book) => (
            <div
            key={book.id}
            id={`lib-card-${book.id}`}
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
                  {book.total_chapters > 0 ? `第${book.current_chapter + 1}章` : "尚未阅读"}
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
          background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
          borderTop: "1px solid var(--border-glass)",
        }}>
          <span style={{ color: "var(--text-dim)", fontSize: ".8rem" }}>已选 {selectedIds.size} 项</span>
          <button className="btn" style={{ fontSize: ".8rem" }} onClick={() => {
            if (selectedIds.size === sortedBooks.length) {
              setSelectedIds(new Set());
            } else {
              setSelectedIds(new Set(sortedBooks.map(b => b.id)));
            }
          }}>{selectedIds.size === sortedBooks.length ? "取消全选" : "全选"}</button>
          <button className="btn" style={{ fontSize: ".8rem" }} onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>取消</button>
          <button className="btn" style={{ fontSize: ".8rem" }} disabled={selectedIds.size === 0} onClick={handleBatchFavorite}>⭐ 收藏所选</button>
          <button className="btn" style={{ fontSize: ".8rem" }} disabled={selectedIds.size === 0} onClick={() => setBatchIconPicker(true)}>🎨 图标</button>
          <button className="btn btn-primary" style={{ fontSize: ".8rem", background: selectedIds.size === 0 ? undefined : "rgba(200,60,50,0.8)" }} disabled={selectedIds.size === 0} onClick={handleBatchDelete}>
            🗑️ 删除所选
          </button>
        </div>
      )}

      {/* 右键菜单 */}
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
            minWidth: 180,
            boxShadow: "0 8px 40px var(--shadow)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem icon="✏️" label="重命名" onClick={() => handleRename(ctxMenu.book)} />
          <MenuItem icon="🎨" label="选择封面图标" onClick={() => { setCtxMenu(null); setIconPicker(ctxMenu.book); }} />
          <MenuItem icon="⭐" label={(optimisticFav[ctxMenu.book.id] ?? ctxMenu.book.favorite) ? "取消收藏" : "添加收藏"} onClick={() => handleToggleFavorite(ctxMenu.book)} />
          <MenuItem icon="🗑️" label="删除" onClick={() => handleDelete(ctxMenu.book)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <MenuItem icon="📂" label="打开文件位置" onClick={() => handleOpenPath(ctxMenu.book)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <MenuItem icon="☑️" label="批量功能" onClick={() => { setCtxMenu(null); setSelectMode(true); setSelectedIds(new Set()); }} />
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
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="或输入自定义 emoji..." style={{ flex: 1, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center" }}
                id="lib-batch-icon-input"
                onKeyDown={(e) => { if (e.key === "Enter") handleBatchIcon((document.getElementById("lib-batch-icon-input") as HTMLInputElement)?.value || ""); }}
              />
              <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: ".82rem" }} onClick={() => handleBatchIcon((document.getElementById("lib-batch-icon-input") as HTMLInputElement)?.value || "")}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 图标选择器 */}
      {iconPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setIconPicker(null)}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>选择封面图标</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center" }}>
              <span style={{ fontSize: "2.5rem" }}>{iconPicker.book_icon || getBookIcon(iconPicker.title)}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {ICON_LIST.map((ic) => (
                <span key={ic} onClick={() => setIconPicker({ ...iconPicker, book_icon: ic })}
                  style={{ fontSize: "1.6rem", cursor: "pointer", padding: 6, borderRadius: "var(--radius-sm)", background: iconPicker.book_icon === ic ? "rgba(var(--accent-rgb),0.12)" : "transparent", border: iconPicker.book_icon === ic ? "1px solid var(--accent)" : "1px solid transparent", transition: "all 0.15s ease" }}>{ic}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={iconPicker.book_icon || ""} onChange={(e) => setIconPicker({ ...iconPicker, book_icon: e.target.value })} placeholder="或输入自定义 emoji..." style={{ flex: 1, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center" }} />
              <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: ".82rem" }} onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("set_book_icon", { bookId: iconPicker.id, icon: iconPicker.book_icon || "" });
                  setIconPicker(null);
                  triggerRefresh();
                } catch {}
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 — 书卡变形动画 */}
      {renameTarget && renameCardRect && (
        <RenameMorphDialog
          book={renameTarget}
          cardRect={renameCardRect}
          onClose={() => { setRenameTarget(null); setRenameCardRect(null); }}
          onRefresh={triggerRefresh}
        />
      )}
    </section>
  );
}

/** 书卡→弹窗 变形动画（基于 GPU transform，书名从书卡飞向中央） */
function RenameMorphDialog({ book, cardRect, onClose, onRefresh }: { book: BookData; cardRect: DOMRect; onClose: () => void; onRefresh: () => void }) {
  const [phase, setPhase] = useState<"start" | "open" | "closing">("start");
  const inputRef = useRef<HTMLInputElement>(null);
  const alreadyRef = useRef(false);
  const [titleStyle, setTitleStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    // 读取书名计算样式
    const cardEl = document.getElementById(`lib-card-${book.id}`);
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

  // 目标弹窗尺寸
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
    if (!newName || newName === book.title) { handleClose(); return; }
    setPhase("closing");
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("rename_book", { bookId: book.id, newTitle: newName });
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

      {/* 弹窗内容层 */}
      <div style={{
        position: "fixed", zIndex: 9999,
        left: phase === "start" || phase === "closing" ? cardRect.left : cx - targetW / 2,
        top: phase === "start" || phase === "closing" ? cardRect.top : cy - targetH / 2,
        width: phase === "start" || phase === "closing" ? cardRect.width : targetW,
        height: phase === "start" || phase === "closing" ? cardRect.height : targetH,
        borderRadius: "var(--radius-lg)",
        background: "var(--bg)",
        backdropFilter: "blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.4))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.4))",
        border: "1px solid var(--border-glass)",
        opacity: phase === "closing" ? 0 : 1,
        filter: phase === "closing" ? "blur(8px)" : "blur(0)",
        padding: 24,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        transition: "left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, filter 0.3s ease",
      }} onClick={(e) => e.stopPropagation()}>
        {/* 弹窗内容 */}
        <div style={{
          opacity: phase === "open" ? 1 : 0,
          transition: "opacity 0.2s ease",
          transitionDelay: phase === "open" ? "0.18s" : "0s",
          width: "100%",
        }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 8, textAlign: "center" }}>重命名</div>
          <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 16, textAlign: "center" }}>
            将「<span style={{ ...titleStyle }}>{book.title}</span>」重命名为
          </div>
          <input ref={inputRef} defaultValue={book.title} autoFocus
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

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
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
        position: "relative",
        zIndex: 1,
      }}
    >
      <span style={{ fontSize: "1rem" }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function getBookIcon(title: string): string {
  const icons: Record<string, string> = { "仙逆": "☯", "诡秘之主": "🕯", "三体": "🌌", "全职高手": "🎮", "星辰变": "⭐" };
  return icons[title] || "📖";
}


/** 搜索输入框组件，与排序按钮在同一排 */
function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 140, maxWidth: 260 }}>
      <input
        ref={ref}
        placeholder="搜索书名..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { onChange(""); ref.current?.blur(); }
        }}
        style={{
          width: "100%", padding: "6px 10px 6px 28px", fontSize: ".82rem",
          background: "var(--glass-bg)", color: "var(--text)",
          border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)",
          outline: "none", boxSizing: "border-box",
        }}
      />
      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: ".78rem", opacity: 0.4, pointerEvents: "none" }}>🔍</span>
      {value && (
        <span onClick={() => onChange("")}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: ".7rem", cursor: "pointer", opacity: 0.4, color: "var(--text)", padding: "2px 4px" }}>
          ✕
        </span>
      )}
    </div>
  );
}

const sampleBooks: BookData[] = [
  { id: "1", title: "仙逆", file_path: "", file_type: "txt", total_chapters: 10, current_chapter: 3, progress: 0.35, chapters: [{ index: 0, title: "第一章 修仙之始", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 灵根觉醒", start_pos: 101, end_pos: 200 }, { index: 2, title: "第三章 初入仙门", start_pos: 201, end_pos: 300 }], book_icon: "" },
  { id: "2", title: "诡秘之主", file_path: "", file_type: "txt", total_chapters: 6, current_chapter: 3, progress: 0.62, chapters: [{ index: 0, title: "第一章 克莱恩", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 值夜者", start_pos: 101, end_pos: 200 }, { index: 2, title: "第三章 占卜家", start_pos: 201, end_pos: 300 }], book_icon: "" },
  { id: "3", title: "三体", file_path: "", file_type: "txt", total_chapters: 6, current_chapter: 5, progress: 0.88, chapters: [{ index: 0, title: "第一章 科学边界", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 三体游戏", start_pos: 101, end_pos: 200 }], book_icon: "" },
  { id: "4", title: "全职高手", file_path: "", file_type: "txt", total_chapters: 5, current_chapter: 0, progress: 0.12, chapters: [{ index: 0, title: "第一章 退役", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 重返", start_pos: 101, end_pos: 200 }], book_icon: "" },
];
