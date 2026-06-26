import React from "react";

interface Props {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  maximized: boolean;
  /** 默认 true：hover 折叠。false：始终展开 */
  foldable?: boolean;
}

export default function WindowControls({ onMinimize, onMaximize, onClose, maximized, foldable = true }: Props) {
  const [hover, setHover] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHover(true);
  };
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setHover(false), 300);
  };

  // 非折叠模式：始终展开，不绑定 hover
  if (!foldable) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, height: 36, flexShrink: 0 }}>
        <Btn title="最小化" onClick={onMinimize}>
          <svg width="12" height="12" viewBox="0 0 10 10"><rect x="0" y="4" width="10" height="2" fill="currentColor"/></svg>
        </Btn>
        <Btn title={maximized ? "还原" : "最大化"} onClick={onMaximize}>
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 10 10"><rect x="2.5" y="0" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.4"/><rect x="0" y="3" width="7" height="7" fill="var(--glass-bg)" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
          )}
        </Btn>
        <Btn title="关闭" onClick={onClose} close>
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </Btn>
      </div>
    );
  }

  // 折叠模式：hover 展开
  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: hover ? 100 : 40,
        height: 36,
        flexShrink: 0,
        transition: "width 0.2s ease",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hover ? 0 : 1,
          transition: "opacity 0.15s ease",
          pointerEvents: hover ? "none" : "auto",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 2L9 6L4 10" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
          opacity: hover ? 1 : 0,
          transition: "opacity 0.12s ease",
          pointerEvents: hover ? "auto" : "none",
        }}
      >
        <Btn title="最小化" onClick={onMinimize}>
          <svg width="12" height="12" viewBox="0 0 10 10"><rect x="0" y="4" width="10" height="2" fill="currentColor"/></svg>
        </Btn>
        <Btn title={maximized ? "还原" : "最大化"} onClick={onMaximize}>
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 10 10"><rect x="2.5" y="0" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.4"/><rect x="0" y="3" width="7" height="7" fill="var(--glass-bg)" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
          )}
        </Btn>
        <Btn title="关闭" onClick={onClose} close>
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </Btn>
      </div>
    </div>
  );
}

/** 单个窗口控制按钮 */
function Btn({ title, onClick, close, children }: { title: string; onClick: () => void; close?: boolean; children: React.ReactNode }) {
  const btnRef = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={btnRef}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: "var(--radius-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "background 0.12s ease",
        color: "var(--text-dim)",
      }}
      onMouseEnter={() => {
        if (!btnRef.current) return;
        if (close) { btnRef.current.style.background = "#e81123"; btnRef.current.style.color = "#fff"; }
        else btnRef.current.style.background = "rgba(128,128,128,0.15)";
      }}
      onMouseLeave={() => {
        if (!btnRef.current) return;
        btnRef.current.style.background = "transparent";
        btnRef.current.style.color = "var(--text-dim)";
      }}
    >
      {children}
    </div>
  );
}
