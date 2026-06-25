import React from "react";
import { TrashIcon, ArtIcon, BookIcon, CheckSquareIcon, FolderIcon, StarIcon } from "./FlatIcons";

// ===== 选择模式复选框 =====
export function SelectCheckbox({ selected }: { selected: boolean }) {
  return (
    <div style={{
      position: "absolute", top: 8, left: 8, zIndex: 10,
      width: 24, height: 24, borderRadius: "var(--radius-sm)",
      border: selected ? "2px solid var(--accent)" : "2px solid rgba(var(--accent-rgb),0.25)",
      background: selected ? "var(--accent)" : "rgba(0,0,0,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: ".75rem", color: "#fff", fontWeight: 700,
      pointerEvents: "none", backdropFilter: "blur(var(--glass-mask-blur))",
    }}>
      {selected ? "✓" : ""}
    </div>
  );
}

// ===== 收藏星星 =====
export function FavStar({ show, bursting }: { show: boolean; bursting?: boolean }) {
  if (!show) return null;
  return (
    <span style={{
      position: "absolute", top: 6, right: 8, fontSize: "1.1rem", zIndex: 10,
      filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))", pointerEvents: "none",
      animation: bursting ? "starBurst 0.5s ease forwards" : "starPop 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) both",
    }}>⭐</span>
  );
}

// ===== 进度条 =====
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="book-progress">
      <div className="book-progress-bar" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// ===== 弹窗遮罩层 =====
export function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "rgba(0,0,0,0.4)", backdropFilter: "blur(var(--glass-mask-blur))",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)",
        padding: 24, maxWidth: 400, width: "90%",
      }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ===== 批量操作栏 =====
interface BatchActionBarProps {
  total: number;
  selectedCount: number;
  selectAllText?: string;
  onToggleSelectAll: () => void;
  onCancel: () => void;
  onFavorite: () => void;
  onIcon: () => void;
  onDelete: () => void;
  onAddToSeries?: () => void;
}
export function BatchActionBar({
  total, selectedCount, selectAllText,
  onToggleSelectAll, onCancel, onFavorite, onIcon, onDelete, onAddToSeries,
}: BatchActionBarProps) {
  const [narrow, setNarrow] = React.useState(window.innerWidth < 420);
  React.useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 420);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      padding: "12px 24px",
      background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
      borderTop: "1px solid var(--border-glass)",
    }}>
      <span style={{ color: "var(--text-dim)", fontSize: ".8rem" }}>已选 {selectedCount} 项</span>
      <button className="btn" style={{ fontSize: ".8rem" }} onClick={onToggleSelectAll}>
        {selectedCount === total ? (selectAllText || "取消全选") : "全选"}
      </button>
      <button className="btn" style={{ fontSize: ".8rem" }} onClick={onCancel}>取消</button>
      {!narrow && (<>
      <button className="btn" style={{ fontSize: ".8rem" }} disabled={selectedCount === 0} onClick={onFavorite}><StarIcon size={14} style={{verticalAlign:'middle',marginRight:4}} />收藏所选</button>
      <button className="btn" style={{ fontSize: ".8rem", display: "inline-flex", alignItems: "center", gap: 4 }} disabled={selectedCount === 0} onClick={onIcon}><ArtIcon size={14} /> 图标</button>
      {onAddToSeries && (
        <button className="btn" style={{ fontSize: ".8rem", display: "inline-flex", alignItems: "center", gap: 4 }} disabled={selectedCount === 0} onClick={onAddToSeries}><FolderIcon size={14} /> 添加到系列</button>
      )}
      </>)}
      <button className="btn btn-primary" style={{ fontSize: ".8rem", background: selectedCount === 0 ? undefined : "rgba(200,60,50,0.8)", display: "inline-flex", alignItems: "center", gap: 4 }} disabled={selectedCount === 0} onClick={onDelete}>
        <TrashIcon size={14} /> 删除所选
      </button>
    </div>
  );
}

// ===== 图标选择器弹窗（单本） =====
interface IconPickerProps {
  currentIcon: string;
  iconList: string[];
  onChange: (icon: string) => void;
  onSave: () => void;
  onClose: () => void;
  /** 额外的底部按钮 */
  extra?: React.ReactNode;
}
export function IconPicker({ currentIcon, iconList, onChange, onSave, onClose, extra }: IconPickerProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>选择封面图标</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {iconList.map((ic) => (
          <span key={ic} onClick={() => onChange(ic)}
            style={{
              fontSize: "1.6rem", cursor: "pointer", padding: 6, borderRadius: "var(--radius-sm)",
              background: currentIcon === ic ? "rgba(var(--accent-rgb),0.12)" : "transparent",
              border: currentIcon === ic ? "1px solid var(--accent)" : "1px solid transparent",
              transition: "all 0.15s ease",
            }}>{ic}</span>
        ))}
      </div>
      {extra}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={currentIcon} onChange={(e) => onChange(e.target.value)}
          placeholder="或输入自定义 emoji..."
          style={{
            flex: 1, background: "var(--glass-bg)", color: "var(--text)",
            border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)",
            padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center",
          }} />
        <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: ".82rem" }} onClick={onSave}>确定</button>
      </div>
    </ModalOverlay>
  );
}

// ===== 批量图标选择器弹窗 =====
interface BatchIconPickerProps {
  count: number;
  iconList: string[];
  onSelectIcon: (icon: string) => void;
  onClose: () => void;
  inputId: string;
  extra?: React.ReactNode;
}
export function BatchIconPicker({ count, iconList, onSelectIcon, onClose, inputId, extra }: BatchIconPickerProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSelectIcon((document.getElementById(inputId) as HTMLInputElement)?.value || "");
    }
  };
  const handleClick = () => {
    onSelectIcon((document.getElementById(inputId) as HTMLInputElement)?.value || "");
  };
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: 16, textAlign: "center" }}>
        批量设置封面图标（{count} 项）
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {iconList.map((ic) => (
          <span key={ic} onClick={() => onSelectIcon(ic)}
            style={{
              fontSize: "1.6rem", cursor: "pointer", padding: 6, borderRadius: "var(--radius-sm)",
              border: "1px solid transparent", transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--accent-rgb),0.12)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >{ic}</span>
        ))}
      </div>
      {extra}
      <div style={{ display: "flex", gap: 8 }}>
        <input id={inputId}
          placeholder="或输入自定义 emoji..."
          style={{
            flex: 1, background: "var(--glass-bg)", color: "var(--text)",
            border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)",
            padding: "8px 12px", fontSize: ".85rem", outline: "none", textAlign: "center",
          }}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: ".82rem" }} onClick={handleClick}>确定</button>
      </div>
    </ModalOverlay>
  );
}

// ===== 右键菜单容器 =====
interface ContextMenuProps {
  x: number;
  y: number;
  children: React.ReactNode;
  minWidth?: number;
}
export function ContextMenu({ x, y, children, minWidth }: ContextMenuProps) {
  return (
    <div style={{
      position: "fixed", left: x, top: y, zIndex: 300,
      background: "var(--surface-glass, var(--glass-bg))",
      backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
      WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
      border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)",
      padding: "6px 0", minWidth: minWidth || 180,
      boxShadow: "0 8px 40px var(--shadow)", overflow: "hidden",
    }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

// ===== 右键菜单项 =====
interface MenuItemProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}
export function MenuItem({ icon, label, onClick, danger }: MenuItemProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
        cursor: "pointer", fontSize: ".9rem",
        color: danger ? (hover ? "#e05050" : "#c03030") : (hover ? "var(--accent)" : "var(--text)"),
        background: hover ? (danger ? "rgba(220,50,50,0.08)" : "rgba(var(--accent-rgb),0.06)") : "transparent",
        transition: "all 0.15s ease",
      }}
    >
      {icon && <span style={{ fontSize: "1rem", lineHeight: 1, display: "inline-flex" }}>{icon}</span>}
      <span>{label}</span>
    </div>
  );
}

// ===== 右键菜单分隔线 =====
export function MenuDivider() {
  return <div style={{ height: 1, background: "var(--border-glass)", margin: "4px 12px" }} />;
}

// ===== 排序按钮 =====
interface SortButtonProps {
  field: string;
  label: React.ReactNode;
  currentField: string;
  asc: boolean;
  onClick: () => void;
}
export function SortButton({ field, label, currentField, asc, onClick }: SortButtonProps) {
  return (
    <button className="btn sort-btn glow-border glow-inner" onClick={onClick} style={{
      fontSize: ".78rem", padding: "4px 12px",
      background: currentField === field ? "rgba(var(--accent-rgb),0.1)" : undefined,
      borderColor: currentField === field ? "var(--accent)" : undefined,
    }}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
        el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
      }}
    >
      {label}{currentField === field && (asc ? " ↑" : " ↓")}
    </button>
  );
}

// ===== 齿轮设置 SVG 图标 =====
export function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

// ===== 阅读器顶部栏玻璃容器（小说/漫画通用） =====
export const topbarGlassStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, width: "100%",
  padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
  background: "linear-gradient(180deg, var(--glass-bg) 60%, transparent)",
  backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
  WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
  borderBottom: "1px solid var(--border-glass)",
  transition: "all 0.45s ease",
  zIndex: 300,
};

// ===== 阅读器返回按钮（小说/漫画通用） =====
export function BackButton({ onClick, label = "← 返回" }: { onClick: () => void; label?: string }) {
  return (
    <button
      className="btn"
      onMouseEnter={(e) => {
        const t = e.currentTarget;
        t.style.background = "rgba(var(--accent-rgb), 0.12)";
        t.style.boxShadow = "0 0 20px rgba(var(--accent-rgb), 0.25)";
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget;
        t.style.background = "none";
        t.style.boxShadow = "none";
      }}
      style={{
        background: "none", border: "none", color: "var(--text)",
        fontSize: "1.2rem", cursor: "pointer", borderRadius: "var(--radius-md)",
        padding: "6px 14px", transition: "all 0.25s ease",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
