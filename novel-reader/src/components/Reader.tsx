import React, { useEffect, useRef, useState, useMemo } from "react";
import { useStore } from "../store";

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
  const windowSize = useStore((s) => s.windowSize);
  const setWindowSize = useStore((s) => s.setWindowSize);
  const keybindings = useStore((s) => s.keybindings);
  const setKeybinding = useStore((s) => s.setKeybinding);
  // 记录当前正在录制的快捷键 (action name 或 null)
  const [recordingKey, setRecordingKey] = useState<string | null>(null);

  // book 和 chapter 是核心派生变量（store 中名为 currentBook / currentChapter）
  const book = currentBook;
  const chapter = book?.chapters?.[currentChapter];

  const [chapterText, setChapterText] = useState("");
  const [fadeState, setFadeState] = useState<"in" | "out" | "visible">("visible"); // 章节切换淡入淡出
  const fadeTimer = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const topbarTimer = useRef<number>(0);
  const settingsTimer = useRef<number>(0);
  const isProgrammaticRef = useRef(false);  // 标记是否为程序化调整大小，避免循环匹配
  const particleReadyRef = useRef(false);    // 粒子 canvas 是否已就绪
  const charPosRef = useRef(0);             // 当前阅读页在章节文本中的字符偏移（跨换挡还原用）
  const sidebarOpenRef = useRef(false);     // 同步 ref，供 timer 回调读取最新值
  const settingsOpenRef = useRef(false);
  const scrollLockRef = useRef(false);      // 章节切换锁，防止 onScroll 循环触发
  const lastScrollTopRef = useRef(0);        // 上次 scrollTop，判断用户滚动方向
  const prevWheelAccumRef = useRef(0);       // 向上滚动的累计值，达到阈值触发上一章
  const nextWheelAccumRef = useRef(0);       // 向下滚动的累计值，达到阈值触发下一章（而非用 onScroll 直接判断）
  // 保持 ref 同步
  sidebarOpenRef.current = sidebarOpen;
  settingsOpenRef.current = settingsOpen;

  // 窗口尺寸配置表 [宽, 高, 每行字数cpl]
  const WINDOW_PRESETS: [number, number, number][] = [
    [800,  550,  32],   // 0: 小
    [900,  650,  36],   // 1: 中
    [1100, 750,  38],   // 2: 默认 (大)
    [1300, 850,  42],   // 3: 超大
    [0,    0,    46],   // 4: 全屏
  ];

  // 工具：根据当前窗口实际尺寸向下匹配预设挡位
  async function matchFloorPreset() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      // 最大化 → 全屏挡位
      if (await win.isMaximized()) {
        if (useStore.getState().windowSize !== 4) {
          isProgrammaticRef.current = true;
          setWindowSize(4);
        }
        return;
      }
      const size = await win.outerSize();
      const w = size.width, h = size.height;
      // 向下取整：取同时满足 w >= presetWidth && h >= presetHeight 的最高挡位
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

  // 窗口大小挡位变化时应用
  useEffect(() => {
    async function applyWindowSize() {
      isProgrammaticRef.current = true; // 标记程序化调整，阻止 onResized 循环
      const preset = WINDOW_PRESETS[windowSize] || WINDOW_PRESETS[2];
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (windowSize === 4) {
        try {
          await win.maximize();
        } catch {}
      } else {
        try {
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          await win.unmaximize();
          await win.setSize(new LogicalSize(preset[0], preset[1]));
          await win.center();
        } catch {}
      }
      isProgrammaticRef.current = false; // 程序化调整完成
    }
    applyWindowSize();
  }, [windowSize]);

  // 监听窗口变化：用户拖标题栏从最大化还原时自动匹配挡位
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setup() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        // 进入阅读器时根据实际窗口大小初始化挡位
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

  // 翻页模式分页
  const [pageIndex, setPageIndex] = useState(0);
  const [flowKey, setFlowKey] = useState(0);

  // 加载章节内容
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
    // 切换到新章节：复位滚动状态，锁定 600ms 防止回流
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

  // 更新进度
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

  // ---- 分页算法 ----
  // 按段落将全文拆成多页，每页不超过 maxLines 行
  // 注意 CSS: textIndent 首行缩进2字、lineHeight 2em
  // 返回 { text, startPos }[] 方便跨换挡时按字符偏移还原位置
  const pageInfo = useMemo(() => {
    void flowKey;
    if (readingMode !== "page" || !chapterText) return [{ text: "", startPos: 0 }];
    const preset = WINDOW_PRESETS[windowSize] || WINDOW_PRESETS[2];
    const winH = windowSize === 4 ? window.innerHeight : preset[1];
    const availH = winH - 80 - 32;             // 顶部标题 + 底部32px安全padding
    const lineH = fontSize * 32;               // line-height:2em = 2 * fontSize * 16px
    const maxLines = Math.max(1, Math.floor(availH / lineH) - 1); // 减1行安全余量，防止溢出裁切

    // 动态计算每行字数：内容区 648px(680-16*2)，中文字宽 ≈ fontSize*16px
    // letter-spacing:0.02em 每个字占 1.02 倍字宽
    const contentWidth = 648;
    const charWidth = fontSize * 16 * 1.02;
    const cpl = Math.max(1, Math.floor(contentWidth / charWidth));
    const firstLineCpl = cpl - 2; // 首行缩进2字

    const paragraphs = chapterText.split("\n").filter(l => l.trim());
    const result: { text: string; startPos: number }[] = [];
    let currentText = "";
    let currentLines = 0;
    let currentStart = 0;        // 当前页在 chapterText 中的字符偏移
    let globalOffset = 0;        // 已处理字符在 chapterText 中的累计偏移

    for (const p of paragraphs) {
      // 计算段落行数（考虑首行缩进）
      const remaining = Math.max(0, p.length - firstLineCpl);
      const pLines = 1 + Math.ceil(remaining / cpl);
      let pCursor = 0; // 段落内已取字符数

      // 情况1：当前页非空且装不下本段 → 先切页
      if (currentLines + pLines > maxLines && currentText) {
        result.push({ text: currentText, startPos: currentStart });
        currentText = "";
        currentLines = 0;
        currentStart = globalOffset;
      }

      // 情况2：一段超过整页容量 → 段落内切分
      if (pLines > maxLines) {
        // 先收尾当前页（如果有残留段落文本）
        if (currentText) {
          result.push({ text: currentText, startPos: currentStart });
          currentText = "";
          currentLines = 0;
          currentStart = globalOffset;
        }
        // 逐页切分这个长段落
        while (pCursor < p.length) {
          const takeFirst = firstLineCpl;        // 首行(firstLineCpl字)
          const takeRest = (maxLines - 1) * cpl; // 后续行
          const takeTotal = takeFirst + takeRest;
          const chunk = p.slice(pCursor, pCursor + takeTotal);
          if (chunk) result.push({ text: chunk, startPos: globalOffset + pCursor });
          pCursor += takeTotal;
        }
        globalOffset += p.length;
        continue; // 本段处理完毕
      }

      // 情况3：能放下 → 追加到当前页
      currentText += (currentText ? "\n" : "") + p;
      currentLines += pLines;
      globalOffset += p.length;

      // 装到顶了 → 切页
      if (currentLines >= maxLines) {
        result.push({ text: currentText, startPos: currentStart });
        currentText = "";
        currentLines = 0;
        currentStart = globalOffset;
      }
    }
    // 收尾
    if (currentText) result.push({ text: currentText, startPos: currentStart });
    if (result.length === 0) result.push({ text: "", startPos: 0 });
    return result;
  }, [chapterText, readingMode, fontSize, flowKey, windowSize]);

  // 向下兼容：只取文本
  const pages = useMemo(() => pageInfo.map(p => p.text), [pageInfo]);

  // 窗口/字号/flowKey 变化时，根据字符偏移还原阅读位置
  useEffect(() => {
    // charPosRef 记录的是上一页的起始偏移，找到包含该偏移的页面
    const charPos = charPosRef.current;
    let bestIdx = 0;
    for (let i = 0; i < pageInfo.length; i++) {
      if (pageInfo[i].startPos <= charPos) bestIdx = i;
    }
    setPageIndex(bestIdx);
  }, [pageInfo]);

  // 翻页时更新字符偏移
  useEffect(() => {
    if (pageInfo[pageIndex]) {
      charPosRef.current = pageInfo[pageIndex].startPos;
    }
  }, [pageIndex, pageInfo]);

  // 全屏/窗口变化重新计算（flowKey++ 触发 useMemo 重算）
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

  // 翻页模式：下一"页"
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

  /** 带动画切换章节：淡出 → 切内容 → 爆发粒子 → 淡入 */
  function animateChapter(newIdx: number, burstX: number, burstY: number) {
    setFadeState("out");
    clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      setChapter(newIdx);
      setPageIndex(0);
      // 先确保 Reader 可见（zIndex 高于粒子 canvas），再淡入和爆发粒子
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

  // 鼠标靠近顶部显示导航栏
  const handleMouseMove = (e: React.MouseEvent) => {
    clearTimeout(topbarTimer.current);
    if (e.clientY < 80) {
      document.querySelector(".reader-topbar")?.classList.add("visible");
    } else {
      // 检查鼠标是否在顶部栏区域内
      const tb = document.querySelector(".reader-topbar");
      if (!tb) return;
      const rect = tb.getBoundingClientRect();
      // 如果顶部栏正在显示且鼠标在它的范围内，不隐藏
      if (tb.classList.contains("visible") && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        return;
      }
      topbarTimer.current = window.setTimeout(() => {
        if (!sidebarOpenRef.current && !settingsOpenRef.current) {
          document.querySelector(".reader-topbar")?.classList.remove("visible");
        }
      }, 300);
    }
  };

  // 离开阅读器时自动隐藏顶部栏
  const handleMouseLeave = () => {
    clearTimeout(topbarTimer.current);
    if (!sidebarOpenRef.current && !settingsOpenRef.current) {
      document.querySelector(".reader-topbar")?.classList.remove("visible");
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(topbarTimer.current);
      clearTimeout(settingsTimer.current);
      clearTimeout(fadeTimer.current);
    };
  }, []);

  // 键盘快捷键监听
  useEffect(() => {
    /** 解析快捷键字符串为匹配函数，支持 Ctrl+Key / Shift+Key 等 */
    function matchKey(e: KeyboardEvent, shortcut: string): boolean {
      const parts = shortcut.toLowerCase().split("+");
      const key = parts.pop()!;
      if (e.key.toLowerCase() !== key) return false;
      // 如果没有 Ctrl/Alt/Shift 修饰键要求，默认不检查
      return (
        parts.includes("ctrl") === (e.ctrlKey || e.metaKey) &&
        parts.includes("shift") === e.shiftKey &&
        parts.includes("alt") === e.altKey
      );
    }

    const handler = (e: KeyboardEvent) => {
      // 如果在录制快捷键或输入框中，不响应
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

  // 检查粒子 canvas 是否就绪
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

  // 在 Reader 打开时初始化阅读器专属粒子 canvas
  useEffect(() => {
    const canvas = document.getElementById("reader-particle-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    let running = true;

    // 复用背景粒子的参数
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

  // 弹出提示
  const [tip, setTip] = useState("");

  const showTip = (msg: string) => {
    setTip(msg);
    setTimeout(() => setTip(""), 3000);
  };

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
    {/* 阅读器背景层上的粒子 canvas，z-index 夹在背景与内容之间 */}
    <canvas id="reader-particle-canvas" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 199, pointerEvents: "none" }} />
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
      onWheel={(e) => {
        // 翻页模式：滚轮翻页
        if (readingMode === "page") {
          if (e.deltaY > 0) nextPage();
          else prevPage();
          return;
        }
      // 滚动模式：用 wheel 累积替换 onScroll 触发翻章
      if (readingMode === "scroll") {
        const el = contentRef.current;
        if (!el || scrollLockRef.current) return;
        if (e.deltaY < 0) {
          // 向上滚 → 回到上一章
          if (currentChapter <= 0) { prevWheelAccumRef.current = 0; return; }
          if (el.scrollTop <= 20) {
            prevWheelAccumRef.current += Math.abs(e.deltaY);
            if (prevWheelAccumRef.current >= 200) {
              prevWheelAccumRef.current = 0;
              scrollLockRef.current = true;
              // 先播放回弹动画再切章
              el.style.transition = "transform 0.25s cubic-bezier(.25,.46,.45,.94)";
              el.style.transform = "translateY(60px)";
              setTimeout(() => {
                el.style.transition = "none";
                el.style.transform = "";
                animateChapter(currentChapter - 1, el.clientWidth / 2, 20);
              }, 280);
            }
          } else {
            prevWheelAccumRef.current = 0;
          }
        } else {
          // 向下滚 → 进入下一章（用 wheel 累积）
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
          } else {
            nextWheelAccumRef.current = 0;
          }
        }
        return;
      }
      }}
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
          lastScrollTopRef.current = el.scrollTop;
        }}
        style={{
          flex: 1,
          overflowY: readingMode === "page" ? "hidden" : "auto",
          padding: readingMode === "scroll" ? "60px 15% 150px" : "4px 0 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          position: "relative",
        }}
      >
        {readingMode === "page" && (
          <div style={{ textAlign: "center", padding: "16px 0 4px", color: "var(--accent)", fontSize: "1.1rem", fontWeight: 600 }}>
            {chapter?.title || "正文"}
          </div>
        )}
        <div
          style={{
            fontFamily: "'Georgia','Noto Serif SC','Source Han Serif SC',serif",
            fontSize: `${fontSize}rem`,
            lineHeight: 2,
            color: "var(--text)",
            maxWidth: 680,
            margin: "0 auto",
            padding: readingMode === "page" ? "0 16px 32px" : "0 16px",
            letterSpacing: "0.02em",
            textAlign: "justify",
            flex: 1,
            overflow: readingMode === "page" ? "hidden" : undefined,
            opacity: fadeState === "out" ? 0 : fadeState === "in" ? 0.7 : 1,
            transition: "opacity 0.25s ease",
            maxWidth: 680,
          }}
        >
          {readingMode === "scroll" && currentChapter > 0 && (
            <div className="over-scroll-hint" style={{
              textAlign: "center",
              padding: "18px 0 8px",
              color: "var(--text-dim)",
              fontSize: ".78rem",
              userSelect: "none",
              animation: "overScrollPulse 2s ease-in-out infinite",
              opacity: lastScrollTopRef.current > 10 ? 0 : 0.6,
              transition: "opacity 0.4s ease",
            }}>
              <div style={{ fontSize: "1.1rem", lineHeight: 1.3, marginBottom: 2 }}>↕</div>
              <div>向上滚动回到上一章</div>
            </div>
          )}
          {readingMode === "scroll" && (
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
          )}
          {readingMode === "page" && formatText(chapterText)}
          {readingMode === "scroll" && formatText(chapterText)}
          {/* 滚动模式底部提示 */}
          {readingMode === "scroll" && currentChapter < book.chapters.length - 1 && (
            <div style={{
              textAlign: "center",
              padding: "20px 0 8px",
              color: "var(--text-dim)",
              fontSize: ".78rem",
              opacity: 0.6,
              animation: "overScrollPulse 2s ease-in-out infinite",
            }}>
              <div style={{ fontSize: "1.1rem", lineHeight: 1.3, marginBottom: 2 }}>↕</div>
              <div>继续向下滚动加载下一章</div>
              <div style={{ marginTop: 2, fontSize: ".7rem", opacity: 0.6 }}>向上滚动回到上一章</div>
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
      {/* 章节目录侧栏 — 鼠标移出0.5秒自动缩回 */}
      <div
        onMouseEnter={() => clearTimeout(settingsTimer.current)}
        onMouseLeave={() => {
          settingsTimer.current = window.setTimeout(() => setSidebarOpen(false), 500);
        }}
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

      {/* 设置面板 — 鼠标移出0.5秒自动缩回 */}
      <div
        onMouseEnter={() => clearTimeout(settingsTimer.current)}
        onMouseLeave={() => {
          settingsTimer.current = window.setTimeout(() => setSettingsOpen(false), 500);
        }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            <span style={{ fontSize: ".85rem", color: "var(--text-dim)", minWidth: 60 }}>窗口</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {["小", "中", "大", "超大", "全屏"].map((label, i) => (
                <button key={i} className="btn" style={{ padding: "6px 10px", fontSize: ".78rem", ...(windowSize === i ? { borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(var(--accent-rgb),0.06)" } : {}) }}
                  onClick={() => {
                    setWindowSize(i);
                    setFlowKey(k => k + 1);
                    setTimeout(() => setFlowKey(k => k + 1), 500);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* 快捷键绑定设置 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            <span style={{ fontSize: ".85rem", color: "var(--text-dim)", minWidth: 60 }}>快捷键</span>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {([
                ["fontSizeUp", "增大字号"],
                ["fontSizeDown", "减小字号"],
              ] as const).map(([action, label]) => (
                <div key={action} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: ".78rem", color: "var(--text-dim)" }}>{label}</span>
                  <button
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: ".78rem",
                      fontFamily: "monospace",
                      minWidth: 80,
                      textAlign: "center",
                      ...(recordingKey === action ? {
                        borderColor: "var(--accent)",
                        color: "var(--accent)",
                        background: "rgba(var(--accent-rgb),0.08)",
                      } : {}),
                    }}
                    onClick={() => {
                      if (recordingKey === action) {
                        setRecordingKey(null); // 取消录制
                      } else {
                        setRecordingKey(action);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (recordingKey !== action) return;
                      e.preventDefault();
                      e.stopPropagation();
                      // 构造快捷键字符串
                      const parts: string[] = [];
                      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                      if (e.shiftKey) parts.push("Shift");
                      if (e.altKey) parts.push("Alt");
                      const key = e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta"
                        ? "" : e.key;
                      if (!key) return;
                      parts.push(key.length === 1 ? key : key);
                      setKeybinding(action as "fontSizeUp" | "fontSizeDown", parts.join("+"));
                      setRecordingKey(null);
                    }}
                  >
                    {recordingKey === action ? "按下按键…" : keybindings[action]}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
