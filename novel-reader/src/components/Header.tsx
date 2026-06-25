import React from "react";
import { useStore } from "../store";
import { flashThemeFade } from "../App";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SunIcon, MoonIcon, SettingsIcon, BookIcon, ArtIcon } from "./FlatIcons";
import WindowControls from "./WindowControls";

export default function Header() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const triggerNovelRefresh = useStore((s) => s.triggerNovelRefresh);
  const triggerComicRefresh = useStore((s) => s.triggerComicRefresh);
  const setDebugPanelOpen = useStore((s) => s.setDebugPanelOpen);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const scanAnimating = useStore((s) => s.scanAnimating);
  const setScanAnimating = useStore((s) => s.setScanAnimating);
  const setScanResult = useStore((s) => s.setScanResult);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [aboutFlying, setAboutFlying] = React.useState(false);
  const [aboutFlyStyle, setAboutFlyStyle] = React.useState<React.CSSProperties>({});
  const logoRef = React.useRef<HTMLAnchorElement>(null);
  const [narrow, setNarrow] = React.useState(window.innerWidth < 420);
  const [veryNarrow, setVeryNarrow] = React.useState(window.innerWidth < 360);
  React.useEffect(() => {
    const onResize = () => { setNarrow(window.innerWidth < 420); setVeryNarrow(window.innerWidth < 360); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const win = getCurrentWindow();
  const [maximized, setMaximized] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try { setMaximized(await win.isMaximized()); } catch {}
    })();
    const onResize = () => {
      (async () => {
        try { setMaximized(await win.isMaximized()); } catch {}
      })();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [win]);

  // 扫描完成监听（放在 Header 独一份）
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<any>("scan-complete", (event) => {
        const r = event.payload;
        setScanAnimating(false);
        setScanResult({ novels: r.novels_imported ?? 0, comics: r.comics_imported ?? 0, errors: r.errors ?? [] });
        triggerNovelRefresh();
        triggerComicRefresh();
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  const handleMinimize = async () => { try { await win.minimize(); } catch {} };
  const handleMaximizeToggle = async () => {
    try {
      const m = await win.isMaximized();
      if (m) { await win.unmaximize(); setMaximized(false); }
      else { await win.maximize(); setMaximized(true); }
    } catch {}
  };
  const handleClose = async () => { try { await win.close(); } catch {} };

  const switchViewMode = (m: "library" | "manga") => {
    if (viewMode === m) return;
    // 滑块动画 450ms，库组件挂载/卸载无缝过渡
    setViewMode(m);
  };

  const openAbout = () => {
    const rect = logoRef.current?.getBoundingClientRect();
    if (!rect) { setAboutOpen(true); return; }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = (vw / 2) - (rect.left + rect.width / 2);
    const dy = (vh / 2) - (rect.top + rect.height / 2);

    // 移除已有的同名 style 标签，防止重复插入
    const existing = document.getElementById("about-fly-keyframes");
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = "about-fly-keyframes";
    style.textContent = `
      @keyframes aboutFlyClone {
        0%   { top: ${rect.top}px; left: ${rect.left}px; transform: scale(1); opacity: 1; }
        100% { top: ${rect.top + dy}px; left: ${rect.left + dx}px; transform: scale(6); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    setAboutFlyStyle({
      position: "fixed", zIndex: 9999, pointerEvents: "none",
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      display: "flex", alignItems: "center", gap: 12,
      fontFamily: "var(--font-title)",
      fontSize: "1.5rem", fontWeight: 600, color: "var(--text)",
      animation: "aboutFlyClone 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
    });
    setAboutFlying(true);

    setTimeout(() => {
      setAboutFlying(false);
      setAboutOpen(true);
      document.getElementById("about-fly-keyframes")?.remove();
    }, 470);
  };

  const handleScan = async () => {
    if (scanAnimating) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const path: string = await invoke("get_library_path");
      if (!path) {
        // 没设书库路径 → 先弹选择器
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false });
        if (!selected) return;
        const selPath = typeof selected === "string" ? selected : selected.path;
        if (!selPath) return;
        await invoke("set_library_path", { newPath: selPath });
      }
    } catch {}
    setScanAnimating(true);
    try {
      const msg: string = await invoke("scan_library");
      console.log("[墨读] 扫描已启动:", msg);
    } catch (e) {
      console.error("[墨读] 扫描启动失败:", e);
      setScanAnimating(false);
    }
  };

  const handleImportFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: true,
      });
      if (!selected) return;
      const path = typeof selected === "string" ? selected : selected.path;
      if (!path) return;

      const { invoke } = await import("@tauri-apps/api/core");
      try {
        await invoke("import_comic", { path });
        triggerComicRefresh();
      } catch (e) {
        console.error("导入文件夹失败:", e);
        alert("导入失败，请确认文件夹中包含图片文件");
      }
    } catch (e) {
      console.error("导入漫画失败:", e);
    }
  };

  const cycleTheme = (e: React.MouseEvent) => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next as any);
    flashThemeFade(e.clientX, e.clientY);
  };

  return (
    <>
    <header style={{
      ...glassPanelStyle,
      ...headerStyle,
      padding: narrow ? "10px 16px" : "14px 32px",
    }}
        data-tauri-drag-region
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 4px 32px rgba(var(--accent-rgb),0.08)"; el.style.borderColor = "rgba(var(--accent-rgb),0.12)"; }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "none"; el.style.borderColor = "var(--border-glass)"; }}
        onMouseMove={(e) => {
          const el = e.currentTarget;
          const rect = el.getBoundingClientRect();
          el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
          el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
        }}
    >
      <div className="light-follow" />
      <div style={{ display: "flex", alignItems: "center", gap: narrow ? 12 : 24, position: "relative", zIndex: 1 }}>
        <a className="logo" href="#" style={{
          ...logoStyle,
          opacity: veryNarrow ? 0 : 1,
          maxWidth: veryNarrow ? 0 : 160,
          overflow: "hidden",
          whiteSpace: "nowrap",
          transition: "opacity 0.3s ease, max-width 0.3s ease, padding 0.3s ease, margin 0.3s ease",
        }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = "var(--accent)"; el.style.transform = "translateY(-1px)"; el.style.textShadow = "0 0 20px rgba(var(--accent-rgb),0.4)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = "var(--text)"; el.style.transform = "none"; el.style.textShadow = "none"; }}
            onClick={(e) => { e.preventDefault(); openAbout(); }}>
          <span className="logo-icon" style={{
            ...logoIconStyle,
            opacity: veryNarrow ? 0 : 1,
            maxWidth: veryNarrow ? 0 : 40,
            overflow: "hidden",
            padding: veryNarrow ? 0 : undefined,
            transition: "opacity 0.3s ease, max-width 0.3s ease, padding 0.3s ease",
          }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 4px 24px rgba(var(--accent-rgb),0.5)"; el.style.transform = "scale(1.08)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 2px 16px rgba(var(--accent-rgb),0.2)"; el.style.transform = "none"; }}>
            墨
          </span>
          <span style={{
            opacity: narrow ? 0 : 1,
            maxWidth: narrow ? 0 : 120,
            overflow: "hidden",
            whiteSpace: "nowrap",
            transition: "opacity 0.3s ease, max-width 0.3s ease",
          }}>墨读</span>
        </a>
        <div className="header-tabs glow-border glow-inner" style={{
          display: "flex", gap: 0, cursor: "pointer", userSelect: "none",
          background: "rgba(var(--accent-rgb),0.06)",
          borderRadius: "var(--radius-sm)", padding: narrow ? 2 : 3,
          position: "relative",
          border: "1px solid rgba(var(--accent-rgb),0.08)",
        }}
          onMouseMove={(e) => {
            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();
            el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
            el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
          }}
        onClick={() => switchViewMode(viewMode === "library" ? "manga" : "library")}>
          {/* 跟随滑块 */}
          <div style={{
            position: "absolute", top: 3, bottom: 3,
            left: viewMode === "library" ? 3 : "calc(50% + 1.5px)",
            width: "calc(50% - 3px)",
            background: "linear-gradient(135deg, rgba(var(--accent-rgb),0.35), rgba(var(--accent-rgb),0.20))",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 0 8px rgba(var(--accent-rgb),0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
            transform: "translateZ(0)",
            willChange: "left",
            transition: "left 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)",
            zIndex: 0,
          }} />
          <span style={{ fontSize: ".82rem", padding: narrow ? "4px 12px" : "6px 20px", position: "relative", zIndex: 1, fontWeight: 500, color: viewMode === "library" ? "var(--text)" : "var(--text-dim)", transition: "color 0.3s ease", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <BookIcon size={15} /> <span style={{
              opacity: narrow ? 0 : 1,
              maxWidth: narrow ? 0 : 40,
              overflow: "hidden",
              whiteSpace: "nowrap",
              transition: "opacity 0.3s ease, max-width 0.3s ease",
            }}>小说</span>
          </span>
          <span style={{ fontSize: ".82rem", padding: narrow ? "4px 12px" : "6px 20px", position: "relative", zIndex: 1, fontWeight: 500, color: viewMode === "manga" ? "var(--text)" : "var(--text-dim)", transition: "color 0.3s ease", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArtIcon size={15} /> <span style={{
              opacity: narrow ? 0 : 1,
              maxWidth: narrow ? 0 : 40,
              overflow: "hidden",
              whiteSpace: "nowrap",
              transition: "opacity 0.3s ease, max-width 0.3s ease",
            }}>漫画</span>
          </span>
        </div>
      </div>
      <div className="header-actions glow-border glow-inner" data-tauri-no-drag style={{
        display: "flex", alignItems: "center", gap: 8, position: "relative", zIndex: 1, padding: 4,
        background: "rgba(var(--accent-rgb),0.04)", borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-glass)",
      }}
        onMouseMove={(e) => {
          const el = e.currentTarget;
          const rect = el.getBoundingClientRect();
          el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
          el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
        }}
      >
        <div style={{ position: "absolute", top: -1, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.4), transparent)", opacity: 0, transition: "opacity 0.3s ease", pointerEvents: "none" }} />
        <button className="btn" onClick={cycleTheme} title="切换主题" style={{
          width: veryNarrow ? 0 : (veryNarrow ? 30 : 36),
          height: veryNarrow ? 0 : (veryNarrow ? 30 : 36),
          borderRadius: "var(--radius-md)", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: veryNarrow ? 0 : 1,
          overflow: "hidden",
          transition: "opacity 0.3s ease, width 0.3s ease, height 0.3s ease",
        }}>
          {theme === "light" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
        </button>
        <button className="btn btn-primary" onClick={handleScan} title={scanAnimating ? "扫描中…" : "扫描书库"} style={{ width: veryNarrow ? 30 : 36, height: veryNarrow ? 30 : 36, borderRadius: "var(--radius-md)", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}>
          {scanAnimating ? (
            <svg width={veryNarrow ? 14 : 18} height={veryNarrow ? 14 : 18} viewBox="0 0 24 24" fill="none" style={{ animation: "scanSpin 1.6s linear infinite" }}>
              <path d="M12 2A10 10 0 0 1 22 12" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="12" x2="20" y2="12" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
              <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.5" />
              <circle cx="12" cy="12" r="1.5" fill="var(--accent)" />
            </svg>
          ) : (
            <svg width={veryNarrow ? 14 : 18} height={veryNarrow ? 14 : 18} viewBox="0 0 24 24" fill="none">
              <path d="M12 2A10 10 0 0 1 22 12" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="12" x2="20" y2="10.5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
              <circle cx="12" cy="12" r="1.5" fill="var(--accent)" />
            </svg>
          )}
        </button>
        <button className="btn" onClick={() => setDebugPanelOpen(true)} title="设置 (字体/颜色/毛玻璃/日志)" style={{ width: veryNarrow ? 30 : 36, height: veryNarrow ? 30 : 36, borderRadius: "var(--radius-md)", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SettingsIcon size={veryNarrow ? 14 : 18} />
        </button>
        {/* 红黄绿小点 → hover 展开窗口控制按钮 */}
        <WindowControls onMinimize={handleMinimize} onMaximize={handleMaximizeToggle} onClose={handleClose} maximized={maximized} />
      </div>
    </header>

    {aboutFlying && (
      <div style={aboutFlyStyle}>
        <span style={{
          width: 36, height: 36, borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, var(--accent), #b8895a)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: "1.1rem", fontWeight: 700,
          boxShadow: "0 2px 16px rgba(var(--accent-rgb),0.2)",
          flexShrink: 0,
        }}>墨</span>
        墨读
      </div>
    )}

    {aboutOpen && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.35)", backdropFilter: "blur(var(--glass-overlay-blur))",
        animation: "aboutFadeIn 0.35s ease",
      }} onClick={() => setAboutOpen(false)}>
        <div style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
          border: "1px solid var(--border-glass)", borderRadius: "var(--radius-full)",
          padding: "40px 48px", maxWidth: 420, width: "90%",
          boxShadow: "0 24px 80px var(--shadow)",
          animation: "aboutScaleIn 0.4s cubic-bezier(0.22, 0.61, 0.36, 1)",
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            width: 56, height: 56, borderRadius: "var(--radius-lg)",
            background: "linear-gradient(135deg, var(--accent), #b8895a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: "1.6rem", fontWeight: 700, marginBottom: 20,
            boxShadow: "0 4px 20px rgba(var(--accent-rgb),0.3)",
          }}>墨</div>
          <h2 style={{ margin: "0 0 4px", fontSize: "1.3rem", fontWeight: 600, color: "var(--text)" }}>墨读</h2>
          <p style={{ margin: "0 0 16px", color: "var(--text-dim)", fontSize: ".82rem", lineHeight: 1.6 }}>
            一个基于 Tauri v2 的本地小说与漫画阅读器，支持毛玻璃 UI、点光源光效、翻页/滚动双模式。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".82rem", color: "var(--text-dim)" }}>
            <span>版本 1.0.1</span>
            <span>技术栈：Tauri v2 / React 18 / TypeScript / Rust</span>
            <span>漫画 PDF 采用 MuPDF / mutool 渲染</span>
          </div>
          <button className="btn" style={{ marginTop: 24, padding: "10px 36px", fontSize: ".85rem" }}
            onClick={() => setAboutOpen(false)}>关闭</button>
        </div>
      </div>
    )}
    </>
  );
}

const headerStyle: React.CSSProperties = {
  transition: "background 0.6s ease, border-color 0.3s ease, box-shadow 0.3s ease",
};

const glassPanelStyle: React.CSSProperties = {
  position: "sticky", top: 0, zIndex: 100,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 32px",
  background: "var(--glass-bg)",
  backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
  WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
  borderBottom: "1px solid var(--border-glass)",
};

const logoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  fontFamily: "var(--font-title)",
  fontSize: "var(--font-title-size)",
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "var(--text)",
  textDecoration: "none",
  position: "relative",
  zIndex: 1,
  cursor: "pointer",
  transition: "color 0.3s ease, transform 0.3s ease, text-shadow 0.3s ease",
};

const logoIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  background: "linear-gradient(135deg, var(--accent), #b8895a)",
  borderRadius: "var(--radius-md)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontSize: "1.1rem",
  fontWeight: 700,
  boxShadow: "0 2px 16px rgba(var(--accent-rgb),0.2)",
  transition: "box-shadow 0.3s ease, transform 0.3s ease", };
