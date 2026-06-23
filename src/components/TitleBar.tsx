import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const BTN_SIZE = 46;
const BTN_HEIGHT = 32;

export default function TitleBar() {
  const [maximized, setMaximized] = React.useState(false);
  const win = getCurrentWindow();

  React.useEffect(() => {
    (async () => {
      try {
        const m = await win.isMaximized();
        setMaximized(m);
      } catch {}
    })();
    const onResize = () => {
      (async () => {
        try {
          const m = await win.isMaximized();
          setMaximized(m);
        } catch {}
      })();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [win]);

  const handleMinimize = async () => {
    try { await win.minimize(); } catch {}
  };

  const handleMaximize = async () => {
    try {
      const m = await win.isMaximized();
      if (m) {
        await win.unmaximize();
        setMaximized(false);
      } else {
        await win.maximize();
        setMaximized(true);
      }
    } catch {}
  };

  const handleClose = async () => {
    try { await win.close(); } catch {}
  };

  return (
    <div
      id="titlebar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: BTN_HEIGHT,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        userSelect: "none",
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
        WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
        borderBottom: "1px solid var(--border-glass)",
      }}
    >
      {/* 左侧拖拽区 */}
      <div
        data-tauri-drag-region
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          fontSize: ".72rem",
          fontWeight: 500,
          color: "var(--text-dim)",
          letterSpacing: "0.04em",
        }}
        onDoubleClick={handleMaximize}
      >
        墨读
      </div>

      {/* 右侧窗口控制按钮 — Windows 风格 _ □ X */}
      <div style={{ display: "flex", height: "100%", alignItems: "stretch" }}>
        {/* 最小化 — */}
        <div
          onClick={handleMinimize}
          title="最小化"
          style={{
            width: BTN_SIZE, height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s ease",
            color: "var(--text-dim)", fontSize: ".7rem",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(128,128,128,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </div>

        {/* 最大化 □ */}
        <div
          onClick={handleMaximize}
          title={maximized ? "还原" : "最大化"}
          style={{
            width: BTN_SIZE, height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s ease",
            color: "var(--text-dim)", fontSize: ".7rem",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(128,128,128,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="2.5" y="0" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="0.8" />
              <rect x="0" y="3" width="7" height="7" fill="var(--glass-bg)" stroke="currentColor" strokeWidth="0.8" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="0.8" />
            </svg>
          )}
        </div>

        {/* 关闭 X */}
        <div
          onClick={handleClose}
          title="关闭"
          style={{
            width: BTN_SIZE, height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s ease",
            color: "var(--text-dim)", fontSize: ".7rem",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e81123";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-dim)";
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
}
