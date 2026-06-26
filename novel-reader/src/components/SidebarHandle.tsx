import React from "react";

interface SidebarHandleProps {
  /** 侧栏当前是否打开 */
  open: boolean;
  /** 鼠标在侧栏边缘附近悬停，需要显示脉冲提示 */
  hint: boolean;
  /** 侧栏面板宽度 (px)，把手水平位置以此计算 */
  sidebarWidth?: number;
  /** 把手 transition 字符串 */
  transition?: string;
  /** z-index */
  zIndex?: number;
}

/**
 * 侧栏把手「>」— 阅读器侧栏关闭时紧贴左边缘，打开时滑到侧栏右侧
 * 带有 glass-panel 毛玻璃样式和脉冲提示动画
 */
export default function SidebarHandle({
  open,
  hint,
  sidebarWidth = 240,
  transition = "left 0.35s ease, opacity 0.3s ease",
  zIndex = 319,
}: SidebarHandleProps) {
  return (
    <div style={{
      position: "fixed",
      zIndex,
      left: open ? sidebarWidth : 0,
      top: "50%",
      transform: "translateY(-50%)",
      transition,
      opacity: hint || open ? 1 : 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 24,
      height: 80,
      background: "var(--glass-bg)",
      backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
      borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
      border: "1px solid var(--border-glass)",
      borderLeft: "none",
      boxShadow: hint || open
        ? "2px 0 12px rgba(var(--accent-rgb),0.15), inset 0 0 8px rgba(var(--accent-rgb),0.05)"
        : "none",
      fontSize: "1.3rem",
      fontWeight: 700,
      color: "var(--text)",
      pointerEvents: "none",
      animation: hint && !open ? "pulseHint 2s ease-in-out infinite" : "none",
    }}>
      {'>'}
    </div>
  );
}
