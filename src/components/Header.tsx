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
          { name: "漫画文件 (CBZ/ZIP)", extensions: ["cbz", "zip"] },
          { name: "PDF 文件", extensions: ["pdf"] },
        ],
      });
      if (!selected) return;
      const paths: string[] = Array.isArray(selected) ? selected.map(s => typeof s === "string" ? s : s.path) : [typeof selected === "string" ? selected : selected.path];
      if (paths.length === 0) return;

      const { invoke } = await import("@tauri-apps/api/core");
      for (const path of paths) {
        try {
          await invoke("import_comic", { path });
        } catch (e) {
          console.error(`导入漫画失败: ${path}`, e);
          alert(`导入失败: ${path}\n\n${e}`);
        }
      }
      triggerRefresh();
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
    <header className="glass-panel" style={headerStyle}>
      <div className="light-follow" />
      <div style={{ display: "flex", alignItems: "center", gap: 24, position: "relative", zIndex: 1 }}>
        <a className="logo" href="#" style={logoStyle}>
          <span className="logo-icon" style={logoIconStyle}>墨</span>
          墨读
        </a>
        <div className="header-tabs" style={{ display: "flex", gap: 4 }}>
          <button
            className="btn"
            style={{
              fontSize: ".82rem",
              padding: "6px 16px",
              background: viewMode === "library" ? "rgba(var(--accent-rgb),0.12)" : "transparent",
              borderColor: viewMode === "library" ? "var(--accent)" : "transparent",
            }}
            onClick={() => setViewMode("library")}
          >
            📖 小说
          </button>
          <button
            className="btn"
            style={{
              fontSize: ".82rem",
              padding: "6px 16px",
              background: viewMode === "manga" ? "rgba(var(--accent-rgb),0.12)" : "transparent",
              borderColor: viewMode === "manga" ? "var(--accent)" : "transparent",
            }}
            onClick={() => setViewMode("manga")}
          >
            🎴 漫画
          </button>
        </div>
      </div>
      <div className="header-actions" style={{ display: "flex", gap: 8, position: "relative", zIndex: 1 }}>
        <button className="btn" onClick={cycleTheme} title="切换主题">
          <span>{THEME_ICONS[theme]}</span>
        </button>
        {viewMode === "library" ? (
          <button className="btn btn-primary" onClick={handleImportNovel}>
            <span>+</span> 导入小说
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-primary" onClick={handleImportManga}>
              <span>+</span> 导入漫画
            </button>
            <button className="btn" onClick={handleImportFolder} title="导入图片文件夹">
              📁 导入文件夹
            </button>
          </div>
        )}
        <button
          className="btn"
          onClick={() => setDebugPanelOpen(true)}
          title="高级设置"
          style={{ fontSize: "1.1rem", padding: "8px 12px", letterSpacing: 2 }}
        >
          ...
        </button>
      </div>
    </header>
  );
}

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 32px",
  background: "linear-gradient(180deg, var(--glass-bg) 60%, transparent)",
  backdropFilter: "blur(24px) saturate(1.4)",
  borderBottom: "1px solid var(--border-glass)",
  transition: "background 0.6s ease, border-color 0.6s ease",
};

const logoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  fontFamily: "'Georgia','Noto Serif SC',serif",
  fontSize: "1.5rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "var(--text)",
  textDecoration: "none",
  position: "relative",
  zIndex: 1,
};

const logoIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  background: "linear-gradient(135deg, var(--accent), #b8895a)",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontSize: "1.1rem",
  fontWeight: 700,
  boxShadow: "0 2px 16px rgba(var(--accent-rgb),0.2)",
};
