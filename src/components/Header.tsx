import React from "react";
import { useStore } from "../store";
import { flashThemeFade } from "../App";

const THEME_ICONS: Record<string, string> = {
  light: "☀️",
  dark: "🌙",
};

export default function Header() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const triggerRefresh = useStore((s) => s.triggerRefresh);
  const setDebugPanelOpen = useStore((s) => s.setDebugPanelOpen);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [aboutFlying, setAboutFlying] = React.useState(false);
  const [aboutFlyStyle, setAboutFlyStyle] = React.useState<React.CSSProperties>({});
  const logoRef = React.useRef<HTMLAnchorElement>(null);

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

  const handleImportNovel = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          { name: "小说文件", extensions: ["txt", "epub", "html", "htm"] },
        ],
      });
      if (!selected) return;
      const paths: string[] = Array.isArray(selected) ? selected.map(s => typeof s === "string" ? s : s.path) : [typeof selected === "string" ? selected : selected.path];
      if (paths.length === 0) return;

      const { invoke } = await import("@tauri-apps/api/core");
      for (const path of paths) {
        try {
          await invoke("import_book", { path });
        } catch (e) {
          console.error(`导入失败: ${path}`, e);
        }
      }
      triggerRefresh();
    } catch (e) {
      console.error("导入失败:", e);
    }
  };

  const handleImportManga = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          { name: "所有漫画文件 (ZIP/PDF/图片)", extensions: ["pdf", "cbz", "zip", "jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"] },
        ],
      });
      if (!selected) return;
      const rawPaths: string[] = Array.isArray(selected) ? selected.map(s => typeof s === "string" ? s : s.path) : [typeof selected === "string" ? selected : selected.path];
      if (rawPaths.length === 0) return;

      // 图片文件取其父文件夹路径（去重），CBZ/ZIP/PDF 直接走文件导入
      const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
      const { invoke } = await import("@tauri-apps/api/core");
      let hasError = false;
      const processed = new Set<string>();
      for (const rawPath of rawPaths) {
        const ext = rawPath.split('.').pop()?.toLowerCase() || "";
        const path = IMG_EXTS.includes(ext)
          ? rawPath.replace(/[/\\][^/\\]*$/, '')
          : rawPath;
        if (processed.has(path)) continue;
        processed.add(path);
        try {
          console.log("[墨读前端] 开始导入漫画:", path);
          const result = await invoke("import_comic", { path });
          console.log("[墨读前端] 导入完成:", result);
        } catch (e) {
          console.error(`导入漫画失败: ${rawPath}`, e);
          hasError = true;
        }
      }
      triggerRefresh();
      if (hasError) console.warn("[墨读前端] 部分导入失败");
    } catch (e) {
      console.error("导入漫画失败:", e);
    }
  };

  const handleImportFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      // 使用 directory 选项打开文件夹选择器（Tauri v2 支持）
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
        triggerRefresh();
      } catch (e) {
        console.error(`导入文件夹失败:`, e);
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
    }}
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 4px 32px rgba(0,0,0,0.45), 0 0 60px rgba(var(--accent-rgb),0.04)"; el.style.borderColor = "rgba(var(--accent-rgb),0.12)"; }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "var(--shadow)"; el.style.borderColor = "var(--border-glass)"; }}
    >
      <div className="light-follow" />
      <div style={{ display: "flex", alignItems: "center", gap: 24, position: "relative", zIndex: 1 }}>
        <a className="logo" href="#" style={logoStyle}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = "var(--accent)"; el.style.transform = "translateY(-1px)"; el.style.textShadow = "0 0 20px rgba(var(--accent-rgb),0.4)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = "var(--text)"; el.style.transform = "none"; el.style.textShadow = "none"; }}
            onClick={(e) => { e.preventDefault(); openAbout(); }}>
          <span className="logo-icon" style={logoIconStyle}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 4px 24px rgba(var(--accent-rgb),0.5)"; el.style.transform = "scale(1.08)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 2px 16px rgba(var(--accent-rgb),0.2)"; el.style.transform = "none"; }}>
            墨
          </span>
          墨读
        </a>
        <div className="header-tabs" style={{
          display: "flex", gap: 0, cursor: "pointer", userSelect: "none",
          background: "rgba(var(--accent-rgb),0.06)",
          borderRadius: "var(--radius-sm)", padding: 3,
          position: "relative",
          transition: "box-shadow 0.3s ease, border-color 0.3s ease",
          border: "1px solid transparent",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 20px rgba(var(--accent-rgb),0.08)"; e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),0.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "transparent"; }}
        onClick={() => switchViewMode(viewMode === "library" ? "manga" : "library")}>
          {/* 跟随滑块 */}
          <div style={{
            position: "absolute", top: 3, bottom: 3,
            left: viewMode === "library" ? 3 : "calc(50% + 1.5px)",
            width: "calc(50% - 3px)",
            background: "rgba(var(--accent-rgb),0.18)",
            borderRadius: "var(--radius-sm)",
            transform: "translateZ(0)",
            willChange: "left",
            transition: "left 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)",
            zIndex: 0,
          }} />
          <span style={{ fontSize: ".82rem", padding: "6px 20px", position: "relative", zIndex: 1, fontWeight: 500, color: viewMode === "library" ? "var(--text)" : "var(--text-dim)", transition: "color 0.3s ease" }}>📖 小说</span>
          <span style={{ fontSize: ".82rem", padding: "6px 20px", position: "relative", zIndex: 1, fontWeight: 500, color: viewMode === "manga" ? "var(--text)" : "var(--text-dim)", transition: "color 0.3s ease" }}>🎴 漫画</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1, padding: 4, background: "rgba(var(--accent-rgb),0.04)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-glass)", backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))", transition: "box-shadow 0.3s ease, border-color 0.3s ease" }}
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 4px 32px rgba(0,0,0,0.45), 0 0 60px rgba(var(--accent-rgb),0.04)"; el.style.borderColor = "rgba(var(--accent-rgb),0.12)"; const glow = el.querySelector("div") as HTMLDivElement; if (glow) glow.style.opacity = "1"; }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "none"; el.style.borderColor = "var(--border-glass)"; const glow = el.querySelector("div") as HTMLDivElement; if (glow) glow.style.opacity = "0"; }}
      >
        {/* 顶部光效 */}
        <div style={{ position: "absolute", top: -1, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.4), transparent)", opacity: 0, transition: "opacity 0.3s ease", pointerEvents: "none" }} />
        <button className="btn" onClick={cycleTheme} title="切换主题" style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span>{THEME_ICONS[theme]}</span>
        </button>
        <button className="btn btn-primary" onClick={viewMode === "library" ? handleImportNovel : handleImportManga} title={viewMode === "library" ? "导入小说" : "导入漫画"} style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}>
          <span style={{ fontSize: "1.3rem", fontWeight: 300, lineHeight: 1 }}>+</span>
        </button>
        <button className="btn" onClick={() => setDebugPanelOpen(true)} title="高级设置" style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".85rem", letterSpacing: 2 }}>
          ⋯
        </button>
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
            width: 56, height: 56