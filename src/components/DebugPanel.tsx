import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

export interface LogEntry {
  id: number;
  level: string;
  message: string;
  timestamp: string;
  source: "frontend" | "backend";
}

let logIdCounter = 0;
const LOG_BUFFER: LogEntry[] = [];
const MAX_LOGS = 1000;

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "." + pad(d.getMilliseconds(), 3);
}

function pushLog(level: string, message: string, source: "frontend" | "backend") {
  LOG_BUFFER.push({ id: ++logIdCounter, level, message, timestamp: nowStamp(), source });
  if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.splice(0, LOG_BUFFER.length - MAX_LOGS);
}

export function initDebugCapture() {
  if ((window as any).__debugCaptured) return;
  (window as any).__debugCaptured = true;
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  console.log = (...args) => { pushLog("LOG", args.map(a => formatArg(a)).join(" "), "frontend"); origLog(...args); };
  console.warn = (...args) => { pushLog("WARN", args.map(a => formatArg(a)).join(" "), "frontend"); origWarn(...args); };
  console.error = (...args) => { pushLog("ERR", args.map(a => formatArg(a)).join(" "), "frontend"); origError(...args); };
}

function formatArg(a: unknown): string {
  try { return typeof a === "string" ? a : JSON.stringify(a, null, 2); } catch { return String(a); }
}

function getLogsSnapshot(): LogEntry[] {
  return [...LOG_BUFFER];
}

function clearLogs() {
  LOG_BUFFER.length = 0;
  logIdCounter = 0;
}

function levelColor(level: string, source: string): string {
  if (level === "ERR") return "#e06060";
  if (level === "WARN") return "#d4a040";
  if (source === "backend") return "var(--accent)";
  return "var(--text)";
}

export default function DebugPanel() {
  const debugPanelOpen = useStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useStore((s) => s.setDebugPanelOpen);
  const books = useStore((s) => s.books);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterSource, setFilterSource] = useState<"all" | "frontend" | "backend">("all");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ level: string; message: string; timestamp: string }>("debug-log", (event) => {
          const { level, message, timestamp } = event.payload;
          LOG_BUFFER.push({ id: ++logIdCounter, level: level || "BACKEND", message, timestamp: timestamp || nowStamp(), source: "backend" });
          if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.splice(0, LOG_BUFFER.length - MAX_LOGS);
        });
      } catch {}
    })();
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => { if (debugPanelOpen) setLogs(getLogsSnapshot()); }, [debugPanelOpen]);
  useEffect(() => {
    if (!debugPanelOpen) return;
    const id = setInterval(() => setLogs(getLogsSnapshot()), 500);
    return () => clearInterval(id);
  }, [debugPanelOpen]);
  useEffect(() => {
    if (autoScroll && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  if (!debugPanelOpen) return null;

  const displayLogs = filterSource === "all" ? logs : logs.filter((l) => l.source === filterSource);
  const appInfo: Record<string, string> = {
    "书库路径": localStorage.getItem("nr-library-path") || "(Tauri 默认)",
    "已导入书籍": books.length + " 本",
    "阅读模式": useStore.getState().readingMode,
    "字号": useStore.getState().fontSize + "rem",
    "窗口挡位": ["小", "中", "大", "超大", "全屏"][useStore.getState().windowSize] || "未知",
    "主题": useStore.getState().theme,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDebugPanelOpen(false)}>
      <div style={{ width: "88vw", height: "82vh", maxWidth: 960, background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid var(--border-glass)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text)" }}>⚙️ 高级设置</span>
            <span style={{ fontSize: ".7rem", color: "var(--text-dim)", opacity: 0.45 }}>Debug Panel</span>
          </div>
          <button className="btn" style={{ padding: "5px 14px" }} onClick={() => setDebugPanelOpen(false)}>✕ 关闭</button>
        </div>
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div style={{ width: 220, flexShrink: 0, padding: "14px 18px", borderRight: "1px solid var(--border-glass)", overflowY: "auto", fontSize: ".8rem" }}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: "var(--text)", fontSize: ".88rem" }}>应用信息</div>
            {Object.entries(appInfo).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ color: "var(--text-dim)", fontSize: ".7rem", marginBottom: 1 }}>{k}</div>
                <div style={{ color: "var(--text)", wordBreak: "break-all", fontSize: ".78rem" }}>{v}</div>
              </div>
            ))}
            <div style={{ fontWeight: 600, marginTop: 18, marginBottom: 8, color: "var(--text)", fontSize: ".88rem" }}>操作</div>
            <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={() => { clearLogs(); setLogs([]); }}>🗑️ 清除日志</button>
            <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={() => { useStore.getState().closeMangaReader(); }}>📕 关闭漫画阅读器</button>
            {false && <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={() => { useStore.getState().setOnlineSearchOpen(true); }}>📚 联网搜书</button>}
            <button className="btn" style={{ width: "100%", justifyContent: "center", fontSize: ".78rem" }} onClick={() => { try { localStorage.clear(); window.location.reload(); } catch {} }}>🔄 重置所有设置</button>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px", borderBottom: "1px solid var(--border-glass)", flexShrink: 0, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: ".8rem", color: "var(--text-dim)" }}>日志输出 ({displayLogs.length} 条)</span>
                <span style={{ fontSize: ".68rem", color: "var(--text-dim)", opacity: 0.4 }}>(共 {logs.length} 条)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <select value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)} style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 6, padding: "3px 8px", fontSize: ".75rem", outline: "none", cursor: "pointer" }}>
                  <option value="all">全部来源</option>
                  <option value="frontend">仅前端</option>
                  <option value="backend">仅后端</option>
                </select>
                <label style={{ fontSize: ".75rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> 自动滚动
                </label>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0", fontFamily: "'SF Mono','Consolas','Courier New',monospace", fontSize: ".73rem", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {displayLogs.length === 0 && <div style={{ color: "var(--text-dim)", opacity: 0.35, textAlign: "center", paddingTop: 50, fontSize: ".8rem" }}>暂无日志</div>}
              {displayLogs.map((entry) => {
                const color = levelColor(entry.level, entry.source);
                const tag = entry.source === "backend" ? "🖥 " : "";
                return (
                  <div key={entry.id} style={{ color, marginBottom: 1, padding: "0 20px", background: entry.source === "backend" ? "rgba(var(--accent-rgb),0.03)" : "transparent" }}>
                    <span style={{ opacity: 0.4, marginRight: 6, fontSize: ".65rem", userSelect: "none" }}>{entry.timestamp}</span>
                    <span style={{ opacity: 0.5, marginRight: 4, fontSize: ".65rem", fontWeight: 700 }}>[{entry.level}]</span>
                    {tag}{entry.message}
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

