import React, { useEffect, useRef, useState } from "react";
import { useStore, BookData } from "../store";

export default function Reader() {
  const currentBook = useStore((s) => s.currentBook);
  const currentChapter = useStore((s) => s.currentChapter);
  const setChapter = useStore((s) => s.setChapter);
  const closeReader = useStore((s) => s.closeReader);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const readingMode = useStore((s) => s.readingMode);
  const setReadingMode = useStore((s) => s.setReadingMode);

  const [chapterText, setChapterText] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const topbarTimer = useRef<number>(0);

  const book = currentBook!;
  const chapter = book?.chapters?.[currentChapter];

  // 翻页模式分页
  const [pageIndex, setPageIndex] = useState(0);
  const [pages, setPages] = useState<string[]>([]);

  // 将文本按每段拆成多页（每页最多300字）
  useEffect(() => {
    if (readingMode !== "page") return;
    const maxChars = 300;
    const paragraphs = chapterText.split("\n").filter(l => l.trim());
    const result: string[] = [];
    let current = "";
    for (const p of paragraphs) {
      if (current.length + p.length > maxChars && current.length > 0) {
        result.push(current);
        current = p;
      } else {
        current += (current ? "\n" : "") + p;
      }
    }
    if (current) result.push(current);
    if (result.length === 0) result.push("");
    setPages(result);
    setPageIndex(0);
  }, [chapterText, readingMode]);

  // 翻页模式：下一"页"（300字内）
  const nextPage = () => {
    if (readingMode === "page") {
      if (pageIndex < pages.length - 1) {
        setPageIndex(pageIndex + 1);
      } else {
        // 当前章节的页翻完了，进入下一章
        nextChapter();
      }
    } else {
      nextChapter();
    }
  };

  const prevPage = () => {
    if (readingMode === "page") {
      if (pageIndex > 0) {
        setPageIndex(pageIndex - 1);
      } else {
        // 回到上一章的最后一页
        prevChapter();
      }
    } else {
      prevChapter();
    }
  };

  const nextChapter = () => {
    if (book && book.chapters && currentChapter < book.chapters.length - 1) {
      setChapter(currentChapter + 1);
      setPageIndex(0);
    }
  };

  const prevChapter = () => {
    if (book && book.chapters && currentChapter > 0) {
      setChapter(currentChapter - 1);
      setPageIndex(0);
    }
  };

  // 鼠标靠近顶部显示导航栏
  const handleMouseMove = (e: React.MouseEvent) => {
    clearTimeout(topbarTimer.current);
    const tb = document.querySelector(".reader-topbar");
    if (!tb) return;
    if (e.clientY < 80) {
      tb.classList.add("visible");
    } else {
      topbarTimer.current = window.setTimeout(() => {
        if (!sidebarOpen && !settingsOpen) {
          tb.classList.remove("visible");
        }
      }, 1500);
    }
  };

  // 离开阅读器时自动隐藏顶部栏
  const handleMouseLeave = () => {
    clearTimeout(topbarTimer.current);
    const tb = document.querySelector(".reader-topbar");
    if (tb && !sidebarOpen && !settingsOpen) {
      tb.classList.remove("visible");
    }
  };

  useEffect(() => {
    return () => clearTimeout(topbarTimer.current);
  }, []);

  // 弹出提示
  const [tip, setTip] = useState("");

  const showTip = (msg: string) => {
    setTip(msg);
    setTimeout(() => setTip(""), 3000);
  };

  const formatText = (text: string) => {
    const displayText = readingMode === "page" ? pages[pageIndex] || "" : text;
    return displayText.split("\n").filter((l) => l.trim()).map((p, i) => (
      <p key={i} style={{ textIndent: "2em", marginBottom: "0.5em" }}>
        {p}
      </p>
    ));
  };

  return (
    <div
      className="reader-view"
      style={{
        display: "flex",
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--reader-bg)",
        flexDirection: "column",
        opacity: 1,
        visibility: "visible",
        transition: "background 0.6s ease",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 顶部导航栏 */}
      <div
        className="reader-topbar"
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, width: "100%",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(180deg, var(--glass-bg) 60%, transparent)",
          backdropFilter: "blur(24px) saturate(1.4)",
          borderBottom: "1px solid var(--border-glass)",
          opacity: 0,
          transform: "translateY(-100%)",
          transition: "all 0.45s ease",
          zIndex: 300,
        }}
      >
        <div className="light-follow" />
        <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
          <button className="btn" style={{ background: "none", border: "none", color: "var(--text)", fontSize: "1.2rem", cursor: "pointer" }} onClick={closeReader}>
            ← 返回书库
          </button>
          <span style={{ fontFamily: "'Georgia','Noto Serif SC',serif", fontWeight: 500 }}>{book.title}</span>
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1 }}>
          <button className="btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            📖 目录
          </button>
          <button className="btn" onClick={() => setSettingsOpen(!settingsOpen)}>
            ⚙️
          </button>
        </div>
      </div>

      {/* 阅读内容 — 翻页模式固定高度，滚动模式连续滚动 */}
      <div
        ref={contentRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            if (readingMode === "scroll" && book && book.chapters && currentChapter < book.chapters.length - 1) {
              setChapter(currentChapter + 1);
            }
          }
        }}
        style={{
          flex: 1,
          overflowY: readingMode === "page" ? "hidden" : "auto",
          padding: readingMode === "scroll" ? "60px 15% 150px" : "60px 15% 0",
          display: "flex",
          flexDirection: "column",
          justifyContent: readingMode === "page" ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia','Noto Serif SC','Source Han Serif SC',serif",
            fontSize: `${fontSize}rem`,
            lineHeight: 2,
            color: "var(--text)",
            maxWidth: 680,
            margin: "0 auto",
            letterSpacing: "0.02em",
            textAlign: "justify" as const,
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: "1.6rem",
              fontWeight: 600,
              marginBottom: 40,
              letterSpacing: "0.1em",
              color: "var(--accent)",
              paddingBottom: 28,
              position: "relative",
            }}
          >
            {chapter?.title || "未知章节"}
            <div
              style={{
                content: "",
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 60,
                height: 1,
                background:
                  "linear-gradient(90deg,transparent,var(--accent),transparent)",
                opacity: 0.35,
              }}
            />
          </div>
          {formatText(chapterText)}
          {/* 翻页模式底部翻页按钮 */}
          {readingMode === "page" && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "40px 0 80px" }}>
              <button className="btn" style={{ flex: 1, justifyContent: "center", padding: "12px 20px" }} onClick={prevPage} disabled={pageIndex <= 0 && currentChapter <= 0}>‹ 上一页</button>
              <span style={{ display: "flex", alignItems: "center", color: "var(--text-dim)", fontSize: ".85rem" }}>{pageIndex + 1}/{pages.length} · {(currentChapter + 1) + "/" + book.chapters.length}章</span>
              <button className="btn" style={{ flex: 1, justifyContent: "center", padding: "12px 20px" }} onClick={nextPage} disabled={pageIndex >= pages.length - 1 && currentChapter >= book.chapters.length - 1}>下一页 ›</button>
            </div>
          )}
          {/* 滚动模式底部提示 */}
          {readingMode === "scroll" && currentChapter < book.chapters.length - 1 && (
            <div style={{
              textAlign: "center",
              padding: "40px 0",
              color: "var(--text-dim)",
              fontSize: ".85rem",
            }}>
              ↓ 继续向下滚动加载下一章
            </div>
          )}
          {readingMode === "scroll" && currentChapter >= book.chapters.length - 1 && (
            <div style={{
              textAlign: "center",
              padding: "40px 0",
              color: "var(--text-dim)",
              fontSize: ".85rem",
              opacity: 0.5,
            }}>
              — 已到最后一章 —
            </div>
          )}
        </div>
      </div>

      {/* 提示气泡 */}
      {tip && (
        <div style={{
          position: "fixed",
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 999,
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid var(--border-glass)",
          borderRadius: 12,
          padding: "12px 24px",
          color: "var(--text)",
          fontSize: ".9rem",
          boxShadow: "0 8px 40px var(--shadow)",
          pointerEvents: "none",
          animation: "tipIn 0.3s ease",
        }}>
          {tip}
        </div>
      )}

      {/* 翻页热区 — 仅在翻页模式显示 */}
      {readingMode === "page" && (<>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "15%",
          height: "100%",
          zIndex: 5,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
          transition: "opacity 0.5s ease",
        }}
        onClick={prevPage}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
      >
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "var(--glass-bg)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border-glass)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.4rem", color: "var(--text-dim)",
        }}>‹</div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "15%",
          height: "100%",
          zIndex: 5,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
          transition: "opacity 0.5s ease",
        }}
        onClick={nextPage}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
      >
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "var(--glass-bg)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border-glass)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.4rem", color: "var(--text-dim)",
        }}>›</div>
      </div>
      </>)}
      {/* 章节目录侧栏 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 300,
          height: "100%",
          zIndex: 20,
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(1.4)",
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.5s ease, background 0.6s ease",
          boxShadow: "4px 0 40px rgba(0,0,0,0.05)",
          overflow: "hidden",
          borderRight: "1px solid var(--border-glass)",
        }}
      >
        <div style={{
          padding: "20px 20px 12px",
          fontFamily: "'Georgia','Noto Serif SC',serif",
          fontSize: "1.1rem",
          fontWeight: 600,
          color: "var(--text)",
          borderBottom: "1px solid var(--border-glass)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
        }}>
          <span>章节目录</span>
          <button className="btn" style={{ padding: "4px 12px", fontSize: ".85rem" }} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <div style={{ padding: "8px 0", overflowY: "auto", height: "calc(100% - 60px)", position: "relative", zIndex: 2 }}>
          {(book?.chapters || []).map((ch, i) => (
            <div
              key={i}
              onClick={() => { setChapter(i); setSidebarOpen(false); }}
              style={{
                padding: "12px 20px",
                cursor: "pointer",
                transition: "all 0.25s ease",
                borderLeft: `3px solid ${i === currentChapter ? "var(--accent)" : "transparent"}`,
                fontSize: ".9rem",
                color: i === currentChapter ? "var(--accent)" : "var(--text-dim)",
                background: i === currentChapter ? "rgba(var(--accent-rgb),0.04)" : "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(var(--accent-rgb),0.03)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = i === currentChapter ? "rgba(var(--accent-rgb),0.04)" : "transparent";
                e.currentTarget.style.color = i === currentChapter ? "var(--accent)" : "var(--text-dim)";
              }}
            >
              <span style={{ fontSize: ".78rem", fontWeight: 600, opacity: 0.6, marginRight: 8 }}>
                第{i + 1}章
              </span>
              {ch.title}
            </div>
          ))}
        </div>
      </div>

      {/* 设置面板 */}
      <div
        style={{
          position: "absolute",
          bottom: settingsOpen ? 0 : "-100%",
          left: 0,
          right: 0,
          zIndex: 20,
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(1.4)",
          padding: "24px 32px 32px",
          borderTop: "1px solid var(--border-glass)",
          transition: "bottom 0.5s ease, background 0.6s ease",
          boxShadow: "0 -8px 40px var(--shadow)",
        }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: ".85rem", color: "var(--text-dim)", minWidth: 60 }}>字号</span>
            <button className="btn" style={{ width: 36, height: 36, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setFontSize(fontSize - 0.1)}>A−</button>
            <span style={{ fontSize: ".9rem", color: "var(--text-dim)", minWidth: 48, textAlign: "center" }}>{fontSize.toFixed(1)}rem</span>
            <button className="btn" style={{ width: 36, height: 36, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setFontSize(fontSize + 0.1)}>A+</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            <span style={{ fontSize: ".85rem", color: "var(--text-dim)", minWidth: 60 }}>阅读模式</span>
            <button
              className="btn"
              style={{ padding: "6px 16px", ...(readingMode === "page" ? { borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(var(--accent-rgb),0.06)" } : {}) }}
              onClick={() => setReadingMode("page")}
            >
              📄 翻页
            </button>
            <button
              className="btn"
              style={{ padding: "6px 16px", ...(readingMode === "scroll" ? { borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(var(--accent-rgb),0.06)" } : {}) }}
              onClick={() => setReadingMode("scroll")}
            >
              📜 滚动
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
