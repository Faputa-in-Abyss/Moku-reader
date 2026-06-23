import React from "react";

interface Props {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  maximized: boolean;
}

export default function WindowControls({ onMinimize, onMaximize, onClose, maximized }: Props) {
  const [hover, setHover] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHover(true);
  };
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setHover(false), 200);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: hover ? 88 : 24,
        height: 36,
        flexShrink: 0,
        transition: "width 0.15s ease",
      }}
    >
      {/* > 箭头（平时状态） */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hover ? 0 : 1,
          transition: "opacity 0.15s ease",
          pointerEvents: hover ? "none" : "auto",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 2L9 6L4 10" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* hover 展开的窗口控制按钮 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          gap: 2,
          justifyContent: "center",
          opacity: hover ? 1 : 0,
          transition: "opacity 0.12s ease",
          pointerEvents: hover ? "auto" : "none",
        }}
      >
        {/* 最小化 */}
        <div
          onClick={(e) => { e.stopPropagation(); onMinimize(); }}
          title="最小化"
          style={{
            width: 28, height: 28, borderRadius: "var(--radius-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.12s ease",
            color: "var(--text-dim)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(128,128,128,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="12" height="12" viewBox="0 0 10 10"><rect x="0" y="4" width="10" height="2" fill="currentColor"/></svg>
        </div>
        {/* 最大化/还原 */}
        <div
          onClick={(e) => { e.stopPropagation(); onMaximize(); }}
          title={maximized ? "还原" : "最大化"}
          style={{
            width: 28, height: 28, borderRadius: "var(--radius-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.12s ease",
            color: "var(--text-dim)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(128,128,128,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 10 10"><rect x="2.5" y="0" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.4"/><rect x="0" y="3" width="7" height="7" fill="var(--glass-bg)" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
          )}
        </div>
        {/* 关闭 */}
        <div
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="关闭"
          style={{
            width: 28, height: 28, borderRadius: "var(--radius-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.12s ease",
            color: "var(--text-dim)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#e81123"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </div>
      </div>
    </div>
  );
}
