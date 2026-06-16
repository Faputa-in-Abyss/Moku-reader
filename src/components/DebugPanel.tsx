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

/** 格式化字节数为可读字符串 */
function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

export default function DebugPanel() {
  const debugPanelOpen = useStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useStore((s) => s.setDebugPanelOpen);
  const books = useStore((s) => s.books);
  const comics = useStore((s) => s.comics);
  const triggerRefresh = useStore((s) => s.triggerRefresh);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterSource, setFilterSource] = useState<"all" | "frontend" | "backend">("all");
  const logEndRef = useRef<HTMLDivElement>(null);
  const [libraryPath, setLibraryPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [renderDpi, setRenderDpi] = useState(150);
  const [dpiEditing, setDpiEditing] = useState(false);
  const [dpiEditValue, setDpiEditValue] = useState("150");
  const dpiInputRef = useRef<HTMLInputElement>(null);

  // 系统资源
  const [procMem, setProcMem] = useState(0);
  const [storageApp, setStorageApp] = useState(0);
  const [storageContent, setStorageContent] = useState(0);

  // fmtBytes 可以直接处理 MB 数值，转成可读格式
  function fmtMB(mb: number): string {
    return fmtBytes(mb * 1024 * 1024);
  }

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

  // 收集系统资源（通过后端 sysinfo 获取）
  useEffect(() => {
    if (!debugPanelOpen) return;
    let cancelled = false;

    // 首次加载时获取书库路径和渲染精度
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const path: string = await invoke("get_library_path");
        if (!cancelled) setLibraryPath(path);
      } catch {}
    })();
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dpi: number = await invoke("get_render_dpi");
        if (!cancelled) setRenderDpi(dpi);
      } catch {}
    })();

    const update = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const res: any = await invoke("get_system_resources");
        if (cancelled) return;
        setProcMem(res.process_mem_mb);
        setStorageApp(res.storage_app_mb);
        setStorageContent(res.storage_content_mb);
      } catch {};
    };
    update();
    const timer = setInterval(update, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [debugPanelOpen]);

  useEffect(() => {
    if (autoScroll && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  // 监听扫描完成事件
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<any>("scan-complete", (event) => {
          const r = event.payload;
          console.log("[墨读] 扫描完成:", `${r.novels_imported}本小说/${r.comics_imported}本漫画`);
          if (r.errors?.length > 0) {
            console.error("[墨读] 扫描错误:", r.errors);
          }
          setScanning(false);
          triggerRefresh();
        });
      } catch {}
    })();
    return () => { unlisten?.(); };
  }, []);

  // 输入框聚焦时全选
  useEffect(() => {
    if (dpiEditing && dpiInputRef.current) {
      dpiInputRef.current.focus();
      dpiInputRef.current.select();
    }
  }, [dpiEditing]);

  const commitDpi = async () => {
    const v = Math.min(300, Math.max(72, Math.round(Number(dpiEditValue)) || 150));
    setRenderDpi(v);
    setDpiEditValue(String(v));
    setDpiEditing(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_render_dpi", { dpi: v });
      console.log(`[墨读] 渲染精度已设为 ${v} DPI（重启后生效，仅新导入）`);
    } catch (err) {
      console.error("[墨读] 设置渲染精度失败:", err);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const msg: string = await invoke("scan_library");
      console.log("[墨读] 扫描已启动:", msg);
    } catch (e) {
      console.error("[墨读] 扫描启动失败:", e);
      setScanning(false);
    }
  };

  const handleSetPath = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      const path = typeof selected === "string" ? selected : selected.path;
      if (!path) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_library_path", { newPath: path });
      setLibraryPath(path);
      console.log("[墨读] 书库路径已设置:", path);
      // 自动触发扫描
      await handleScan();
    } catch (e) {
      console.error("[墨读] 设置书库路径失败:", e);
    }
  };

  if (!debugPanelOpen) return null;

  const displayLogs = filterSource === "all" ? logs : logs.filter((l) => l.source === filterSource);
  const appInfo: Record<string, string> = {
    "书库路径": libraryPath || "（未设置）",
    "阅读模式": useStore.getState().readingMode,
    "字号": useStore.getState().fontSize + "rem",
    "窗口挡位": ["小", "中", "大", "超大", "全屏"][useStore.getState().windowSize] || "未知",
    "主题": useStore.getState().theme,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDebugPanelOpen(false)}>
      <div style={{ width: "88vw", height: "82vh", maxWidth: 960, background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid var(--border-glass)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text)" }}>高级设置</span>
            <span style={{ fontSize: ".7rem", color: "var(--text-dim)", opacity: 0.45 }}>Debug Panel</span>
          </div>
          <button className="btn" style={{ padding: "5px 10px", fontSize: ".85rem" }} onClick={() => setDebugPanelOpen(false)}>✕</button>
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
            {/* 已导入书籍/漫画合并到一行 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--text-dim)", fontSize: ".7rem", marginBottom: 1 }}>已导入书籍</div>
                <div style={{ color: "var(--text)", fontSize: ".78rem" }}>{books.length} 本</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--text-dim)", fontSize: ".7rem", marginBottom: 1 }}>已导入漫画</div>
                <div style={{ color: "var(--text)", fontSize: ".78rem" }}>{comics.length} 本</div>
              </div>
            </div>
            <div style={{ fontWeight: 600, marginTop: 18, marginBottom: 10, color: "var(--text)", fontSize: ".88rem" }}>系统资源</div>
            {/* 应用占用内存 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "var(--text-dim)", marginBottom: 4 }}>
                <span>📦 应用占用内存</span>
                <span>{procMem > 0 ? fmtBytes(procMem * 1024 * 1024) : "—"}</span>
              </div>
            </div>
            {/* 本地存储 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "var(--text-dim)", marginBottom: 4 }}>
                <span>⚙️ 应用本身</span>
                <span>{storageApp > 0 ? fmtMB(storageApp) : "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "var(--text-dim)", marginBottom: 4 }}>
                <span>📚 小说漫画</span>
                <span>{storageContent > 0 ? fmtMB(storageContent) : "—"}</span>
              </div>
            </div>
            <div style={{ fontWeight: 600, marginTop: 18, marginBottom: 8, color: "var(--text)", fontSize: ".88rem" }}>操作</div>
            <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={handleSetPath}>📂 更改书库路径</button>
            <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} disabled={scanning || !libraryPath} onClick={handleScan}>{scanning ? "⏳ 扫描中..." : "🔄 扫描书库"}</button>
            <div style={{ margin: "10px 0 8px", borderTop: "1px solid var(--border-glass)", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", marginBottom: 4 }}>
                <span style={{ color: "var(--text)" }}>🖼️ PDF 渲染精度</span>
                {dpiEditing ? (
                  <input
                    ref={dpiInputRef}
                    type="number" min={72} max={300}
                    value={dpiEditValue}
                    onChange={(e) => setDpiEditValue(e.target.value)}
                    onBlur={() => commitDpi()}
                    onKeyDown={(e) => { if (e.key === "Enter") commitDpi(); if (e.key === "Escape") { setDpiEditing(false); setDpiEditValue(String(renderDpi)); } }}
                    style={{ width: 80, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--accent)", borderRadius: 6, padding: "2px 8px", fontSize: ".75rem", textAlign: "center", outline: "none" }}
                  />
                ) : (
                  <span
                    onClick={() => { setDpiEditing(true); setDpiEditValue(String(renderDpi)); }}
                    style={{ color: "var(--accent)", fontWeight: 600, cursor: "pointer", borderBottom: "1px dashed var(--accent)" }}
                    title="点击输入精确值"
                  >{renderDpi} DPI</span>
                )}
              </div>
              <input
                type="range" min={72} max={300} step={1} value={renderDpi}
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  setRenderDpi(v);
                  setDpiEditValue(String(v));
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("set_render_dpi", { dpi: v });
                    console.log(`[墨读] 渲染精度已设为 ${v} DPI（重启后生效，仅新导入）`);
                  } catch (err) {
                    console.error("[墨读] 设置渲染精度失败:", err);
                  }
                }}
                style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "var(--text-dim)", marginTop: 0, padding: "0 2px", userSelect: "none" }}>
                <span>72</span>
                <span>|</span><span>100</span><span>|</span>
                <span>150</span>
                <span>|</span><span>200</span><span>|</span>
                <span>250</span>
                <span>|</span>
                <span>300</span>
              </div>
            </div>
            <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={() => { clearLogs(); setLogs([]); }}>🗑️ 清除日志</button>
            {false && <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={() => { useStore.getState().setOnlineSearchOpen(true); }}>📚 联网搜书</button>}
            <button className="btn" style={{ width: "100%", justifyContent: "center", fontSize: ".78rem" }} onClick={async () => { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_render_dpi", { dpi: 150 }); } catch {} setRenderDpi(150); try { localStorage.clear(); window.location.reload(); } catch {} }}>🔄 重置所有设置</button>
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

