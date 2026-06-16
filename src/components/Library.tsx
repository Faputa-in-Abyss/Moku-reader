import React, { useEffect, useState, useRef } from "react";
import { useStore, BookData } from "../store";

export default function Library() {
  const books = useStore((s) => s.books);
  const setBooks = useStore((s) => s.setBooks);
  const openReader = useStore((s) => s.openReader);
  const refreshKey = useStore((s) => s.refreshKey);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [ctxMenu, setCtxMenu] = useState<{ book: BookData; x: number; y: number } | null>(null);
  const [iconPicker, setIconPicker] = useState<BookData | null>(null);
  const [animStars, setAnimStars] = useState<Record<string, boolean>>({});
  const animRef = useRef<number>(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    setCtxMenu({ book, x: e.clientX, y: e.clientY });
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

  const handleToggleFavorite = async (book: BookData) => {
    setCtxMenu(null);
    const wasFavorited = book.favorite;
    // 添加收藏时播放弹出动画
    if (!wasFavorited) {
      setAnimStars((p) => ({ ...p, [book.id]: true }));
      await new Promise((r) => setTimeout(r, 400));
      setAnimStars((p) => { const n = { ...p }; delete n[book.id]; return n; });
    } else {
      // 取消收藏时播放消散动画
      setAnimStars((p) => ({ ...p, [book.id]: true }));
      await new Promise((r) => setTimeout(r, 400));
      setAnimStars((p) => { const n = { ...p }; delete n[book.id]; return n; });
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("toggle_favorite", { bookId: book.id });
      triggerRefresh();
    } catch {}
  };

  const handleDelete = async (book: BookData) => {
    setCtxMenu(null);
    if (!confirm(`确定要删除「${book.title}」吗？`)) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_book", { bookId: book.id });
      triggerRefresh();
      // 删除后自动扫描书库
      invoke("scan_library").catch(() => {});
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
      // 删除后自动扫描书库
      invoke("scan_library").catch(() => {});
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
      <div className="book-grid">
        {books.map((book) => (
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
                  width: 24, height: 24, borderRadius: 6,
                  border: selectedIds.has(book.id) ? "2px solid var(--accent)" : "2px solid rgba(var(--accent-rgb),0.25)",
                  background: selectedIds.has(book.id) ? "var(--accent)" : "rgba(0,0,0,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: ".75rem", color: "#fff", fontWeight: 700,
                  pointerEvents: "none", backdropFilter: "blur(4px)",
                }}>
                  {selectedIds.has(book.id) ? "✓" : ""}
                </div>
              )}
              <div className={`book-cover${selectedIds.has(book.id) ? " cover-selected" : ""}`}>
                {book.favorite && <span key={"s-"+book.id} style={{ position: "absolute", top: 6, right: 8, fontSize: "1.1rem", zIndex: 2, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))", pointerEvents: "none" }}>⭐</span>}
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
          background: "var(--glass-bg)", backdropFilter: "blur(24px) saturate(1.4)",
          borderTop: "1px solid var(--border-glass)",
        }}>
          <span style={{ color: "var(--text-dim)", fontSize: ".8rem" }}>已选 {selectedIds.size} 项</span>
          <button className="btn" style={{ fontSize: ".8rem" }} onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>取消</button>
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
            backdropFilter: "blur(24px) saturate(1.4)",
            WebkitBackdropFilter: "blur(24px) saturate(1.4)",
            border: "1px solid var(--border-glass)",
            borderRadius: 12,
            padding: "6px 0",
            minWidth: 180,
            boxShadow: "0 8px 40px var(--shadow)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem icon="✏️" label="重命名" onClick={() => handleRename(ctxMenu.book)} />
          <MenuItem icon="🎨" label="选择封面图标" onClick={() => { setCtxMenu(null); setIconPicker(ctxMenu.book); }} />
          <MenuItem icon="⭐" label={ctxMenu.book.favorite ? "取消收藏" : "添加收藏"} onClick={() => handleToggleFavorite(ctxMenu.book)} />
          <MenuItem icon="🗑️" label="删除" onClick={() => handleDelete(ctxMenu.book)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <MenuItem icon="📂" label="打开文件位置" onClick={() => handleOpenPath(ctxMenu.book)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <MenuItem icon="☑️" label="批量选择" onClick={() => { setCtxMenu(null); setSelectMode(true); setSelectedIds(new Set()); }} />
        </div>
      )}

      {/* 图标选择器 */}
      {iconPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setIconPicker(null)}>
          <div style={{ background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>选择封面图标</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center" }}>
              <span style={{ fontSize: "2.5rem" }}>{iconPicker.book_icon || getBookIcon(iconPicker.title)}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {ICON_LIST.map((ic) => (
                <span key={ic} onClick={() => setIconPicker({ ...iconPicker, book_icon: ic })}
                  style={{ fontSize: "1.6rem", cursor: "pointer", padding: 6, borderRadius: 8, background: iconPicker.book_icon === ic ? "rgba(var(--accent-rgb),0.12)" : "transparent", border: iconPicker.book_icon === ic ? "1px solid var(--accent)" : "1px solid transparent", transition: "all 0.15s ease" }}>{ic}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={iconPicker.book_icon || ""} onChange={(e) => setIconPicker({ ...iconPicker, book_icon: e.target.value })} placeholder="或输入自定义 emoji..." style={{ flex: 1, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center" }} />
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
    </section>
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

const sampleBooks: BookData[] = [
  { id: "1", title: "仙逆", file_path: "", file_type: "txt", total_chapters: 10, current_chapter: 3, progress: 0.35, chapters: [{ index: 0, title: "第一章 修仙之始", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 灵根觉醒", start_pos: 101, end_pos: 200 }, { index: 2, title: "第三章 初入仙门", start_pos: 201, end_pos: 300 }], book_icon: "" },
  { id: "2", title: "诡秘之主", file_path: "", file_type: "txt", total_chapters: 6, current_chapter: 3, progress: 0.62, chapters: [{ index: 0, title: "第一章 克莱恩", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 值夜者", start_pos: 101, end_pos: 200 }, { index: 2, title: "第三章 占卜家", start_pos: 201, end_pos: 300 }], book_icon: "" },
  { id: "3", title: "三体", file_path: "", file_type: "txt", total_chapters: 6, current_chapter: 5, progress: 0.88, chapters: [{ index: 0, title: "第一章 科学边界", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 三体游戏", start_pos: 101, end_pos: 200 }], book_icon: "" },
  { id: "4", title: "全职高手", file_path: "", file_type: "txt", total_chapters: 5, current_chapter: 0, progress: 0.12, chapters: [{ index: 0, title: "第一章 退役", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 重返", start_pos: 101, end_pos: 200 }], book_icon: "" },
];
