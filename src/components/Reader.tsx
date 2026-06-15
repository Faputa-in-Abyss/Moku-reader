import React, { useEffect, useRef, useState, useMemo } from "react";
import { useStore } from "../store";

export default function Reader() {
  const currentBook = useStore((s) => s.currentBook);
  const currentChapter = useStore((s) => s.currentChapter);
  const setChapter = useStore((s) => s.setChapter);
  const closeReader = useStore((s) => s.closeReader);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const fontBold = useStore((s) => s.fontBold);
  const setFontBold = useStore((s) => s.setFontBold);
  const readerFont = useStore((s) => s.readerFont);
  const setReaderFont = useStore((s) => s.setReaderFont);
  const readerTextColor = useStore((s) => s.readerTextColor);
  const setReaderTextColor = useStore((s) => s.setReaderTextColor);
  const readerBgColor = useStore((s) => s.readerBgColor);
  const setReaderBgColor = useStore((s) => s.setReaderBgColor);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const readingMode = useStore((s) => s.readingMode);
  const setReadingMode = useStore((s) => s.setReadingMode);
  const windowSize = useStore((s) => s.windowSize);
  const setWindowSize = useStore((s) => s.setWindowSize);
  const keybindings = useStore((s) => s.keybindings);
  const setKeybinding = useStore((s) => s.setKeybinding);
  const bookmarks = useStore((s) => s.bookmarks);
  const addBookmark = useStore((s) => s.addBookmark);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const loadBookmarks = useStore((s) => s.loadBookmarks);

  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const book = currentBook;
  const chapter = book?.chapters?.[currentChapter];

  const [chapterText, setChapterText] = useState("");
  const [fadeState, setFadeState] = useState<"in" | "out" | "visible">("visible");
  const fadeTimer = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const topbarTimer = useRef<number>(0);
  const settingsTimer = useRef<number>(0);
  const isProgrammaticRef = useRef(false);
  const particleReadyRef = useRef(false);
  const charPosRef = useRef(0);
  const sidebarOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const scrollLockRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const prevWheelAccumRef = useRef(0);
  const nextWheelAccumRef = useRef(0);
  const sideTimer = useRef<number>(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxSubMenu, setCtxSubMenu] = useState<string | null>(null);
  const [tip, setTip] = useState("");
  const tipTimer = useRef<number>(0);
  const COLOR_PRESETS = ["#e8ddd0", "#d4a96a", "#c0392b", "#e67e22", "#27ae60", "#2980b9", "#8e44ad", "#ecf0f1", "#bdc3c7", "#7f8c8d", "#2c3e50", "#1a1a2e"];

  sidebarOpenRef.current = sidebarOpen;
  settingsOpenRef.current = settingsOpen;

  const WINDOW_PRESETS: [number, number, number][] = [
    [800,  550,  32],
    [900,  650,  36],
    [1100, 750,  38],
    [1300, 850,  42],
    [0,    0,    46],
  ];

  async function matchFloorPreset() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        if (useStore.getState().windowSize !== 4) {
          isProgrammaticRef.current = true;
          setWindowSize(4);
        }
        return;
      }
      const size = await win.outerSize();
      const w = size.width, h = size.height;
      let best = 0;
      for (let i = 0; i < 4; i++) {
        const [pw, ph] = WINDOW_PRESETS[i];
        if (w >= pw && h >= ph) best = i;
      }
      if (best !== useStore.getState().windowSize) {
        isProgrammaticRef.current = true;
        setWindowSize(best);
      }
    } catch {}
  }

  useEffect(() => {
    async function applyWindowSize() {
      isProgrammaticRef.current = true;
      const preset = WINDOW_PRESETS[windowSize] || WINDOW_PRESETS[2];
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (windowSize === 4) {
        try { await win.maximize(); } catch {}
      } else {
        try {
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          await win.unmaximize();
          await win.setSize(new LogicalSize(preset[0], preset[1]));
          await win.center();
        } catch {}
      }
      isProgrammaticRef.current = false;
    }
    applyWindowSize();
  }, [windowSize]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setup() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        await matchFloorPreset();
        unlisten = await win.onResized(() => {
          if (isProgrammaticRef.current) return;
          matchFloorPreset();
        });
      } catch {}
    }
    setup();
    return () => { unlisten?.(); };
  }, []);

  const [pageIndex, setPageIndex] = useState(0);
  const [flowKey, setFlowKey] = useState(0);

  useEffect(() => {
    async function load() {
      if (!book) {
        showTip("书籍数据异常，请重新导入");
        return;
      }
      if (!book.chapters || book.chapters.length === 0) {
        showTip("该书没有可读的章节");
        setChapterText("(没有章节内容)");
        return;
      }
      const idx = Math.min(currentChapter, book.chapters.length - 1);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const text: string = await invoke("get_chapter_content", {
          bookId: book.id,
          chapterIndex: idx,
        });
        setChapterText(text);
      } catch (e) {
        console.error("读取章节失败:", e);
        showTip("读取章节失败，请检查书籍文件");
        setChapterText(`(读取章节失败: ${e})`);
      }
    }
    load();
    scrollLockRef.current = true;
    lastScrollTopRef.current = 0;
    prevWheelAccumRef.current = 0;
    nextWheelAccumRef.current = 0;
    contentRef.current?.scrollTo({ top: 0 });
    setTimeout(() => {
      scrollLockRef.current = false;
      lastScrollTopRef.current = 0;
    }, 600);
  }, [currentChapter]);

  useEffect(() => {
    async function saveProgress() {
      if (!book) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_progress", {
          bookId: book.id,
          chapterIndex: currentChapter,
        });
      } catch {}
    }
    saveProgress();
  }, [currentChapter]);

  const pageInfo = useMemo(() => {
    void flowKey;
    if (readingMode !== "page" || !chapterText) return [{ text: "", startPos: 0 }];
    const preset = WINDOW_PRESETS[windowSize] || WINDOW_PRESETS[2];
    const winH = windowSize === 4 ? window.innerHeight : preset[1];
    const availH = winH - 80 - 32;
    const lineH = fontSize * 32;
    const maxLines = Math.max(1, Math.floor(availH / lineH) - 1);
    const contentWidth = 648;
    const charWidth = fontSize * 16 * 1.02;
    const cpl = Math.max(1, Math.floor(contentWidth / charWidth));
    const firstLineCpl = cpl - 2;
    const paragraphs = chapterText.split("\n").filter(l => l.trim());
    const result: { text: string; startPos: number }[] = [];
    let currentText = "";
    let currentLines = 0;
    let currentStart = 0;
    let globalOffset = 0;
    for (const p of paragraphs) {
      const remaining = Math.max(0, p.length - firstLineCpl);
      const pLines = 1 + Math.ceil(remaining / cpl);
      let pCursor = 0;
      if (currentLines + pLines > maxLines && currentText) {
        result.push({ text: currentText, startPos: currentStart });
        currentText = "";
        currentLines = 0;
        currentStart = globalOffset;
      }
      if (pLines > maxLines) {
        if (currentText) {
          result.push({ text: currentText, startPos: currentStart });
          currentText = "";
          currentLines = 0;
          currentStart = globalOffset;
        }
        while (pCursor < p.length) {
          const takeFirst = firstLineCpl;
          const takeRest = (maxLines - 1) * cpl;
          const takeTotal = takeFirst + takeRest;
          const chunk = p.slice(pCursor, pCursor + takeTotal);
          if (chunk) result.push({ text: chunk, startPos: globalOffset + pCursor });
          pCursor += takeTotal;
        }
        globalOffset += p.length;
        continue;
      }
      currentText += (currentText ? "\n" : "") + p;
      currentLines += pLines;
      globalOffset += p.length;
      if (currentLines >= maxLines) {
        result.push({ text: currentText, startPos: currentStart });
        currentText = "";
        currentLines = 0;
        currentStart = globalOffset;
      }
    }
    if (currentText) result.push({ text: currentText, startPos: currentStart });
    if (result.length === 0) result.push({ text: "", startPos: 0 });
    return result;
  }, [chapterText, readingMode, fontSize, flowKey, windowSize]);

  const pages = useMemo(() => pageInfo.map(p => p.text), [pageInfo]);

  useEffect(() => {
    const charPos = charPosRef.current;
    let bestIdx = 0;
    for (let i = 0; i < pageInfo.length; i++) {
      if (pageInfo[i].startPos <= charPos) bestIdx = i;
    }
    setPageIndex(bestIdx);
  }, [pageInfo]);

  useEffect(() => {
    if (pageInfo[pageIndex]) {
      charPosRef.current = pageInfo[pageIndex].startPos;
    }
  }, [pageIndex, pageInfo]);

  useEffect(() => {
    if (readingMode !== "page") return;
    const onResize = () => setFlowKey(k => k + 1);
    const onFullscreen = () => setTimeout(() => setFlowKey(k => k + 1), 300);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
    };
  }, [readingMode]);

  const nextPage = () => {
    if (readingMode === "page") {
      if (pageIndex < pages.length - 1) {
        setPageIndex(pageIndex + 1);
      } else {
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
        prevChapter();
      }
    } else {
      prevChapter();
    }
  };

  function animateChapter(newIdx: number, burstX: number, burstY: number) {
    setFadeState("out");
    clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      setChapter(newIdx);
      setPageIndex(0);
      setFadeState("in");
      Promise.resolve().then(() => {
        try { (window as any).__burstParticles?.(burstX, burstY, 50); } catch {}
      });
      setTimeout(() => setFadeState("visible"), 400);
    }, 200);
  }

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

  const showTip = (msg: string) => {
    clearTimeout(tipTimer.current);
    setTip(msg);
    tipTimer.current = window.setTimeout(() => setTip(""), 3000);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    clearTimeout(topbarTimer.current);
    if (e.clientY < 80) {
      document.querySelector(".reader-topbar")?.classList.add("visible");
    } else {
      const tb = document.querySelector(".reader-topbar");
      if (!tb) return;
      const rect = tb.getBoundingClientRect();
      if (tb.classList.contains("visible") && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        return;
      }
      topbarTimer.current = window.setTimeout(() => {
        if (!sidebarOpenRef.current && !settingsOpenRef.current) {
          document.querySelector(".reader-topbar")?.classList.remove("visible");
        }
      }, 300);
    }

    if (e.clientX < 60 && e.clientY > 100 && e.clientY < window.innerHeight - 60 && !sidebarOpenRef.current && !settingsOpenRef.current) {
      setSidebarOpen(true);
    } else if (!settingsOpenRef.current && e.clientX >= 60) {
      if (sidebarOpenRef.current) {
        if (e.clientX > 280) {
          if (!sideTimer.current) {
            sideTimer.current = window.setTimeout(() => {
              setSidebarOpen(false);
              sideTimer.current = 0;
            }, 500);
          }
        } else {
          if (sideTimer.current) {
            clearTimeout(sideTimer.current);
            sideTimer.current = 0;
          }
        }
      }
    }

    if (settingsOpenRef.current && !sidebarOpenRef.current) {
      const winW = window.innerWidth;
      if (e.clientX < winW - 300) {
        if (!sideTimer.current) {
          sideTimer.current = window.setTimeout(() => {
            setSettingsOpen(false);
            sideTimer.current = 0;
          }, 500);
        }
      } else {
        if (sideTimer.current) {
          clearTimeout(sideTimer.current);
          sideTimer.current = 0;
        }
      }
    }
  };

  const handleMouseLeave = () => {
    clearTimeout(topbarTimer.current);
    if (!sidebarOpenRef.current && !settingsOpenRef.current) {
      document.querySelector(".reader-topbar")?.classList.remove("visible");
    }
    if (sideTimer.current) {
      clearTimeout(sideTimer.current);
      sideTimer.current = 0;
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(topbarTimer.current);
      clearTimeout(settingsTimer.current);
      clearTimeout(fadeTimer.current);
      clearTimeout(tipTimer.current);
    };
  }, []);

  useEffect(() => {
    if (book) loadBookmarks(book.id);
  }, [book?.id]);

  useEffect(() => {
    function matchKey(e: KeyboardEvent, shortcut: string): boolean {
      const parts = shortcut.toLowerCase().split("+");
      const key = parts.pop()!;
      if (e.key.toLowerCase() !== key) return false;
      return (
        parts.includes("ctrl") === (e.ctrlKey || e.metaKey) &&
        parts.includes("shift") === e.shiftKey &&
        parts.includes("alt") === e.altKey
      );
    }
    const handler = (e: KeyboardEvent) => {
      if (recordingKey) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (matchKey(e, keybindings.fontSizeUp)) {
        e.preventDefault();
        setFontSize(fontSize + 0.1);
      } else if (matchKey(e, keybindings.fontSizeDown)) {
        e.preventDefault();
        setFontSize(fontSize - 0.1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fontSize, keybindings, recordingKey, setFontSize]);

  useEffect(() => {
    const check = () => {
      if (typeof (window as any).__burstParticles === 'function') {
        particleReadyRef.current = true;
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  }, []);

  useEffect(() => {
    const canvas = document.getElementById("reader-particle-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    let running = true;
    const particles: any[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push(createReaderParticle(W, H));
    }
    function createReaderParticle(w: number, h: number) {
      return {
        x: Math.random() * w, y: Math.random() * h,
        s: 0.8 + Math.random() * 1.8,
        sx: (Math.random() - 0.5) * 0.15,
        sy: (Math.random() - 0.5) * 0.15,
        o: 0.08 + Math.random() * 0.25,
        wf: 0.005 + Math.random() * 0.015,
        wa: 0.2 + Math.random() * 0.6,
        wo: Math.random() * 6.28,
        cm: Math.random(),
      };
    }
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    let clr: number[] = [];
    function getClr() {
      const s = getComputedStyle(document.documentElement);
      const p = s.getPropertyValue("--accent-rgb").trim().split(",").map(Number);
      clr = p.length === 3 ? p : [184, 137, 80];
    }
    getClr();
    let time = 0;
    function animate() {
      if (!running) return;
      ctx!.clearRect(0, 0, W, H);
      time += 0.015;
      for (const p of particles) {
        const wb = Math.sin(time * p.wf + p.wo) * p.wa;
        p.sx += (Math.random() - 0.5) * 0.015;
        p.sy += (Math.random() - 0.5) * 0.015;
        p.sx *= 0.98;
        p.sy *= 0.98;
        p.x += p.sx + wb * 0.02;
        p.y += p.sy + Math.cos(time * p.wf + p.wo) * 0.1;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.s, 0, 6.28);
        ctx!.fillStyle = `rgba(${clr[0]},${clr[1]},${clr[2]},${p.o})`;
        ctx!.fill();
      }
      requestAnimationFrame(animate);
    }
    animate();
    return () => {
      running = false;
      window.removeEventListener("resize", resize);
    };
  }, []);

  const formatText = (text: string) => {
    const displayText = readingMode === "page" ? pages[pageIndex] || "" : text;
    return displayText.split("\n").filter((l) => l.trim()).map((p, i) => (
      <p key={i} style={{ textIndent: "2em", margin: 0 }}>
        {p}
      </p>
    ));
  };

  return (
    <>
    <canvas id="reader-particle-canvas" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 199, pointerEvents: "none" }} />
    <div
      className="reader-view"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => { if (e.button === 2) { setCtxMenu({ x: e.clientX, y: e.clientY }); setCtxSubMenu(null); } }}
      style={{
        display: "flex", position: "fixed", inset: 0, zIndex: 200,
        background: readerBgColor || "var(--reader-bg)",
        flexDirection: "column", opacity: 1, visibility: "visible", transition: "background 0.6s ease",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onWheel={(e) => {
        if (readingMode === "page") {
          if (e.deltaY > 0) nextPage();
          else prevPage();
          return;
        }
        if (readingMode === "scroll") {
          const el = contentRef.current;
          if (!el || scrollLockRef.current) return;
          if (e.deltaY < 0) {
            if (currentChapter <= 0) { prevWheelAccumRef.current = 0; return; }
            if (el.scrollTop <= 20) {
              prevWheelAccumRef.current += Math.abs(e.deltaY);
              if (prevWheelAccumRef.current >= 200) {
                prevWheelAccumRef.current = 0;
                scrollLockRef.current = true;
                el.style.transition = "transform 0.25s cubic-bezier(.25,.46,.45,.94)";
                el.style.transform = "translateY(60px)";
                setTimeout(() => {
                  el.style.transition = "none";
                  el.style.transform = "";
                  animateChapter(currentChapter - 1, el.clientWidth / 2, 20);
                }, 280);
              }
            } else { prevWheelAccumRef.current = 0; }
          } else {
            const ch = book?.chapters;
            if (!ch || currentChapter >= ch.length - 1) { nextWheelAccumRef.current = 0; return; }
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
              nextWheelAccumRef.current += Math.abs(e.deltaY);
              if (nextWheelAccumRef.current >= 200) {
                nextWheelAccumRef.current = 0;
                scrollLockRef.current = true;
                el.style.transition = "transform 0.25s cubic-bezier(.25,.46,.45,.94)";
                el.style.transform = "translateY(-60px)";
                setTimeout(() => {
                  el.style.transition = "none";
                  el.style.transform = "";
                  animateChapter(currentChapter + 1, el.clientWidth / 2, el.clientHeight - 20);
                }, 280);
              }
            } else { nextWheelAccumRef.current = 0; }
          }
          return;
        }
      }}
    >
      {/* 顶部导航栏 */}
      <div className="reader-topbar" style={{
        position: "fixed", top: 0, left: 0, right: 0, width: "100%",
        padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(180deg, var(--glass-bg) 60%, transparent)",
        backdropFilter: "blur(24px) saturate(1.4)", borderBottom: "1px solid var(--border-glass)",
        opacity: 0, transform: "translateY(-100%)", transition: "all 0.45s ease", zIndex: 300,
      }}>
        <div className="light-follow" />
        <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
          <button
            className="btn"
            onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = "rgba(var(--accent-rgb), 0.12)"; t.style.boxShadow = "0 0 20px rgba(var(--accent-rgb), 0.25)"; }}
            onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = "none"; t.style.boxShadow = "none"; }}
            style={{ background: "none", border: "none", color: "var(--text)", fontSize: "1.2rem", cursor: "pointer", borderRadius: 10, padding: "6px 14px", transition: "all 0.25s ease" }}
            onClick={closeReader}>
            ← 返回书库
          </button>
          <span style={{ fontFamily: "Georgia,Noto Serif SC,serif", fontWeight: 500 }}>{book?.title}</span>
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1 }}>
          <button className="btn" onClick={() => setSidebarOpen(!sidebarOpen)}>📖 目录</button>
          <button className="btn" onClick={() => setSettingsOpen(!settingsOpen)}>⚙️</button>
        </div>
      </div>

      {/* 正文区域 */}
      <div ref={contentRef} style={{
        flex: 1, overflowY: "auto", padding: "40px 16px 80px",
        fontSize: `${fontSize}rem`, lineHeight: 2, letterSpacing: "0.02em",
        fontFamily: readerFont || "'Georgia','Noto Serif SC',serif",
        fontWeight: fontBold ? 700 : 400,
        maxWidth: 680, margin: "0 auto", width: "100%",
        color: readerTextColor || "var(--text)", transition: "color 0.3s ease, background 0.3s ease",
      }}>
        {fadeState === "out" ? null : (
          <div style={{ opacity: fadeState === "in" ? 0 : 1, transition: "opacity 0.3s ease" }}>
            {chapterText !== "(没有章节内容)" && chapterText !== "" && !chapterText.startsWith("(读取章节失败") && (
              <div style={{ textAlign: "center", marginBottom: 24, fontSize: "1.1rem", fontWeight: 600, color: "var(--text)" }}>
                {book?.chapters?.[currentChapter]?.title || ""}
              </div>
            )}
            {chapterText ? formatText(chapterText) : <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>加载中...</div>}
          </div>
        )}
      </div>

      {/* 目录侧栏 */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 280,
        background: "var(--glass-bg)", backdropFilter: "blur(24px) saturate(1.4)",
        borderRight: "1px solid var(--border-glass)",
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.35s ease", zIndex: 400,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-glass)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: "var(--text)" }}>📖 目录</span>
          <button className="btn" style={{ padding: "2px 8px", fontSize: ".7rem" }} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        {bookmarks.length > 0 && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border-glass)" }}>
            <div style={{ fontSize: ".75rem", color: "var(--accent)", marginBottom: 4 }}>🔖 书签</div>
            {bookmarks.map((bm) => (
              <div key={bm.chapterIndex} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span onClick={() => { animateChapter(bm.chapterIndex, window.innerWidth / 2, window.innerHeight / 2); setSidebarOpen(false); }}
                  style={{ fontSize: ".8rem", color: "var(--text)", cursor: "pointer", flex: 1 }}>{bm.chapterTitle}</span>
                <span onClick={() => removeBookmark(bm.chapterIndex)} style={{ fontSize: ".7rem", color: "var(--text-dim)", cursor: "pointer", padding: "2px 6px" }}>✕</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {book?.chapters?.map((ch: any, i: number) => (
            <div key={i}
              onClick={() => { animateChapter(i, window.innerWidth / 2, window.innerHeight / 2); setSidebarOpen(false); }}
              style={{
                padding: "10px 20px", cursor: "pointer", fontSize: ".85rem",
                color: i === currentChapter ? "var(--accent)" : "var(--text)",
                background: i === currentChapter ? "rgba(var(--accent-rgb),0.06)" : "transparent",
                borderLeft: i === currentChapter ? "3px solid var(--accent)" : "3px solid transparent",
                transition: "all 0.2s ease",
              }}
            >{ch.title || `第${i+1}章`}{bookmarks.find(b => b.chapterIndex === i) ? <span style={{ marginLeft: 6, fontSize: ".75rem" }}>🔖</span> : null}</div>
          ))}
        </div>
      </div>

      {/* 设置面板 */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 300,
        background: "var(--glass-bg)", backdropFilter: "blur(24px) saturate(1.4)",
        borderLeft: "1px solid var(--border-glass)",
        transform: settingsOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.35s ease", zIndex: 400,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-glass)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: "var(--text)" }}>⚙️ 设置</span>
          <button className="btn" style={{ padding: "2px 8px", fontSize: ".7rem" }} onClick={() => setSettingsOpen(false)}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "var(--text-dim)", fontSize: ".78rem", marginBottom: 8 }}>阅读模式</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["page", "scroll"].map((mode) => (
                <button key={mode} className="btn" style={{
                  flex: 1, padding: "8px 0", fontSize: ".82rem",
                  background: readingMode === mode ? "rgba(var(--accent-rgb),0.12)" : undefined,
                  borderColor: readingMode === mode ? "var(--accent)" : undefined,
                }} onClick={() => setReadingMode(mode as any)}>
                  {mode === "page" ? "翻页" : "滚动"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "var(--text-dim)", fontSize: ".78rem", marginBottom: 8 }}>字号</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn" style={{ padding: "4px 10px", fontSize: ".7rem" }} onClick={() => setFontSize(fontSize - 0.1)}>A-</button>
              <span style={{ color: "var(--text)", fontSize: ".85rem", minWidth: 36, textAlign: "center" }}>{fontSize.toFixed(1)}</span>
              <button className="btn" style={{ padding: "4px 10px", fontSize: ".7rem" }} onClick={() => setFontSize(fontSize + 0.1)}>A+</button>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "var(--text-dim)", fontSize: ".78rem", marginBottom: 8 }}>字体</div>
            <FontSearchDropdown
              fonts={[
                { value: "", label: "默认衬线" },
                { value: "'PingFang SC','Microsoft YaHei',sans-serif", label: "无衬线 (苹方/微软雅黑)" },
                { value: "'STSong','SimSun',serif", label: "宋体" },
                { value: "'KaiTi','STKaiti',serif", label: "楷体" },
                { value: "'FangSong','STFangsong',serif", label: "仿宋" },
                { value: "'Source Han Serif SC','Noto Serif CJK SC',serif", label: "思源宋体" },
                { value: "'LXGW WenKai','STKaiti',serif", label: "霞鹜文楷" },
                { value: "'ZCOOL XiaoWei','Noto Serif SC',serif", label: "站酷小魏体" },
                { value: "'ZCOOL QingKe HuangYou','PingFang SC',sans-serif", label: "站酷清刻黄油体" },
                { value: "'Ma Shan Zheng','STKaiti',serif", label: "马善政楷书" },
                { value: "'Liu Jian Mao Cao','STKaiti',cursive", label: "柳建毛草体" },
                { value: "'ZCOOL KuaiLe',sans-serif", label: "站酷快乐体" },
              ]}
              current={readerFont}
              onSelect={setReaderFont}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "var(--text-dim)", fontSize: ".78rem", marginBottom: 8 }}>窗口尺寸</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["小", "中", "大", "超大", "全屏"].map((label, i) => (
                <button key={i} className="btn" style={{
                  flex: 1, padding: "6px 0", fontSize: ".72rem",
                  background: windowSize === i ? "rgba(var(--accent-rgb),0.12)" : undefined,
                  borderColor: windowSize === i ? "var(--accent)" : undefined, minWidth: 44,
                }} onClick={() => setWindowSize(i)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 提示 */}
      {tip && (
        <div style={{
          position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
          background: "var(--glass-bg)", backdropFilter: "blur(20px)",
          border: "1px solid var(--border-glass)", borderRadius: 30,
          padding: "10px 24px", fontSize: ".85rem", color: "var(--text)",
          zIndex: 500, animation: "tipIn 0.3s ease",
        }}>{tip}</div>
      )}

      {/* 右键菜单 */}
      {ctxMenu && !ctxSubMenu && (
        <div style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: 599, cursor: "default" }} onClick={() => { setCtxMenu(null); setCtxSubMenu(null); }} onContextMenu={(e) => e.preventDefault()}>
          <div style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 600,
            background: "var(--glass-bg)", backdropFilter: "blur(24px) saturate(1.4)",
            border: "1px solid var(--border-glass)", borderRadius: 12,
            padding: "6px 0", minWidth: 190, boxShadow: "0 8px 40px var(--shadow)",
          }} onClick={(e) => e.stopPropagation()}>
            <CtxItem label={bookmarks.find(b => b.chapterIndex === currentChapter) ? "🔖 取消书签" : "🔖 添加书签"} onClick={() => {
              if (bookmarks.find(b => b.chapterIndex === currentChapter)) {
                removeBookmark(currentChapter);
              } else {
                addBookmark(currentChapter, book?.chapters?.[currentChapter]?.title || `第${currentChapter+1}章`);
              }
              setCtxMenu(null);
            }} />
            <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
            <CtxItem label="🎨 主题颜色 ▸" onClick={() => setCtxSubMenu("colors")} />
            <CtxItem label="🔤 字体 ▸" onClick={() => setCtxSubMenu("font")} />
            <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
            <CtxItem label={fontBold ? "✅ 字体加粗" : "⬜ 字体加粗"} onClick={() => { setFontBold(!fontBold); setCtxMenu(null); }} />
            <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />
            <CtxItem label="A- 缩小字号" onClick={() => { setFontSize(fontSize - 0.1); setCtxMenu(null); }} />
            <CtxItem label="A+ 放大字号" onClick={() => { setFontSize(fontSize + 0.1); setCtxMenu(null); }} />
          </div>
        </div>
      )}

      {/* 颜色二级菜单 */}
      {ctxMenu && ctxSubMenu === "colors" && (
        <div style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: 609, cursor: "default" }} onClick={() => { setCtxMenu(null); setCtxSubMenu(null); }} onContextMenu={(e) => e.preventDefault()}>
          <div style={{
            position: "fixed", left: ctxMenu.x + 10, top: ctxMenu.y, zIndex: 610,
            background: "var(--glass-bg)", backdropFilter: "blur(24px) saturate(1.4)",
            border: "1px solid var(--border-glass)", borderRadius: 12,
            padding: 14, minWidth: 210, boxShadow: "0 8px 40px var(--shadow)",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ color: "var(--text)", fontSize: ".82rem", marginBottom: 10, fontWeight: 500, display: "flex", justifyContent: "space-between" }}>
              <span>🎨 颜色</span>
              <span style={{ cursor: "pointer", color: "var(--text-dim)", fontSize: ".8rem" }} onClick={() => { setCtxSubMenu(null); }}>← 返回</span>
            </div>
            <div style={{ fontSize: ".75rem", color: "var(--text-dim)", marginBottom: 6 }}>字体颜色</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {COLOR_PRESETS.map((c) => (
                <div key={"t"+c} onClick={() => { setReaderTextColor(c); setCtxMenu(null); setCtxSubMenu(null); }} style={{ width: 26, height: 26, borderRadius: 6, background: c, cursor: "pointer", outline: readerTextColor === c ? "2px solid var(--accent)" : "none", outlineOffset: 2 }} />
              ))}
              {readerTextColor ? <span onClick={() => { setReaderTextColor(""); }} style={{ color: "var(--text-dim)", fontSize: ".7rem", cursor: "pointer", padding: "4px 6px" }}>重置</span> : null}
            </div>
            <div style={{ fontSize: ".75rem", color: "var(--text-dim)", marginBottom: 6 }}>背景颜色</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {COLOR_PRESETS.map((c) => (
                <div key={"b"+c} onClick={() => { setReaderBgColor(c); setCtxMenu(null); setCtxSubMenu(null); }} style={{ width: 26, height: 26, borderRadius: 6, background: c, cursor: "pointer", outline: readerBgColor === c ? "2px solid var(--accent)" : "none", outlineOffset: 2 }} />
              ))}
              {readerBgColor ? <span onClick={() => { setReaderBgColor(""); }} style={{ color: "var(--text-dim)", fontSize: ".7rem", cursor: "pointer", padding: "4px 6px" }}>重置</span> : null}
            </div>
          </div>
        </div>
      )}

      {/* 字体二级菜单 */}
      {ctxMenu && ctxSubMenu === "font" && (
        <div style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: 609, cursor: "default" }} onClick={() => { setCtxMenu(null); setCtxSubMenu(null); }} onContextMenu={(e) => e.preventDefault()}>
          <div style={{
            position: "fixed", left: ctxMenu.x + 10, top: ctxMenu.y, zIndex: 610,
            background: "var(--glass-bg)", backdropFilter: "blur(24px) saturate(1.4)",
            border: "1px solid var(--border-glass)", borderRadius: 12,
            padding: "6px 0", minWidth: 200, boxShadow: "0 8px 40px var(--shadow)",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "8px 14px 4px", color: "var(--text-dim)", fontSize: ".78rem", display: "flex", justifyContent: "space-between" }}>
              <span>🔤 字体</span>
              <span style={{ cursor: "pointer", color: "var(--text-dim)", fontSize: ".8rem" }} onClick={() => { setCtxSubMenu(null); }}>← 返回</span>
            </div>
            {[
              { value: "", label: "默认衬线" },
              { value: "'PingFang SC','Microsoft YaHei',sans-serif", label: "无衬线(苹方/雅黑)" },
              { value: "'STSong','SimSun',serif", label: "宋体" },
              { value: "'KaiTi','STKaiti',serif", label: "楷体" },
              { value: "'FangSong','STFangsong',serif", label: "仿宋" },
              { value: "'Source Han Serif SC','Noto Serif CJK SC',serif", label: "思源宋体" },
              { value: "'LXGW WenKai','STKaiti',serif", label: "霞鹜文楷" },
              { value: "'ZCOOL XiaoWei','Noto Serif SC',serif", label: "站酷小魏体" },
              { value: "'ZCOOL QingKe HuangYou','PingFang SC',sans-serif", label: "站酷清刻黄油体" },
              { value: "'Ma Shan Zheng','STKaiti',serif", label: "马善政楷书" },
              { value: "'Liu Jian Mao Cao','STKaiti',cursive", label: "柳建毛草体" },
              { value: "'ZCOOL KuaiLe',sans-serif", label: "站酷快乐体" },
            ].map((f) => (
              <CtxItem key={f.value} label={(readerFont || "") === f.value ? "✓ " + f.label : f.label} onClick={() => { setReaderFont(f.value); setCtxMenu(null); setCtxSubMenu(null); }} />
            ))}
          </div>
          </div>
      )}
    </div>
    </>
  );
}

function CtxItem({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: "10px 16px", cursor: "pointer", fontSize: ".85rem", color: hover ? "var(--accent)" : "var(--text)", background: hover ? "rgba(var(--accent-rgb),0.06)" : "transparent", transition: "all 0.15s ease" }}>
      {label}
    </div>
  );
}

// 带搜索的下拉字体选择器
function FontSearchDropdown({ fonts, current, onSelect }: {
  fonts: { value: string; label: string }[];
  current: string;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = fonts.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()));
  const currentLabel = fonts.find((f) => f.value === current)?.label || "默认衬线";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(!open)}
        style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "7px 10px", fontSize: ".82rem", cursor: "pointer", userSelect: "none" }}>
        {currentLabel}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--bg)", border: "1px solid var(--border-glass)", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 10, overflow: "hidden" }}>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索字体..."
            style={{ width: "100%", padding: "8px 10px", background: "var(--glass-bg)", color: "var(--text)", border: "none", borderBottom: "1px solid var(--border-glass)", fontSize: ".8rem", outline: "none" }} />
          <div style={{ maxHeight: 140, overflowY: "auto" }}>
            {filtered.map((f) => (
              <div key={f.value} onClick={() => { onSelect(f.value); setOpen(false); setSearch(""); }}
                style={{ padding: "8px 10px", fontSize: ".8rem", cursor: "pointer", color: f.value === current ? "var(--accent)" : "var(--text)", background: f.value === current ? "rgba(var(--accent-rgb),0.06)" : "transparent" }}>
                {f.label}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: ".78rem", color: "var(--text-dim)", textAlign: "center" }}>未找到匹配字体</div>}
          </div>
        </div>
      )}
    </div>
  );
}
