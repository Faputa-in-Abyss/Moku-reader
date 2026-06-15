import React, { useEffect, useState } from "react";
import { useStore, BookData } from "../store";

export default function Library() {
  const books = useStore((s) => s.books);
  const setBooks = useStore((s) => s.setBooks);
  const openReader = useStore((s) => s.openReader);
  const refreshKey = useStore((s) => s.refreshKey);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  // 右键菜单状态
  const [ctxMenu, setCtxMenu] = useState<{
    book: BookData;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const lib: BookData[] = await invoke("get_library");
        setBooks(lib);
      } catch {
        setBooks(sampleBooks);
      }
    }
    load();
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
            onClick={() => openReader(book)}
            onContextMenu={(e) => handleCtxMenu(e, book)}
            onMouseMove={(e) => handleCardGlow(e, e.currentTarget)}
          >
            <div className="book-cover">
              <div className="book-cover-icon">{getBookIcon(book.title)}</div>
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
          <MenuItem icon="⭐" label={ctxMenu.book.favorite ? "取消收藏" : "添加收藏"} onClick={() => handleToggleFavorite(ctxMenu.book)} />
          <MenuItem icon="🗑️" label="删除" onClick={() => handleDelete(ctxMenu.book)} />
          <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
          <MenuItem icon="📂" label="打开文件位置" onClick={() => handleOpenPath(ctxMenu.book)} />
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
  { id: "1", title: "仙逆", file_path: "", file_type: "txt", total_chapters: 10, current_chapter: 3, progress: 0.35, chapters: [{ index: 0, title: "第一章 修仙之始", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 灵根觉醒", start_pos: 101, end_pos: 200 }, { index: 2, title: "第三章 初入仙门", start_pos: 201, end_pos: 300 }] },
  { id: "2", title: "诡秘之主", file_path: "", file_type: "txt", total_chapters: 6, current_chapter: 3, progress: 0.62, chapters: [{ index: 0, title: "第一章 克莱恩", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 值夜者", start_pos: 101, end_pos: 200 }, { index: 2, title: "第三章 占卜家", start_pos: 201, end_pos: 300 }] },
  { id: "3", title: "三体", file_path: "", file_type: "txt", total_chapters: 6, current_chapter: 5, progress: 0.88, chapters: [{ index: 0, title: "第一章 科学边界", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 三体游戏", start_pos: 101, end_pos: 200 }] },
  { id: "4", title: "全职高手", file_path: "", file_type: "txt", total_chapters: 5, current_chapter: 0, progress: 0.12, chapters: [{ index: 0, title: "第一章 退役", start_pos: 0, end_pos: 100 }, { index: 1, title: "第二章 重返", start_pos: 101, end_pos: 200 }] },
];
