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
  const [renderThreads, setRenderThreads] = useState(1);
  const [threadEditing, setThreadEditing] = useState(false);
  const [threadEditValue, setThreadEditValue] = useState("1");
  const [glassIntensity, setGlassIntensity] = useState(() => {
    const saved = localStorage.getItem("nr-glass-intensity");
    return saved ? Number(saved) : 24;
  });
  const [radiusIntensity, setRadiusIntensity] = useState(() => {
    const saved = localStorage.getItem("nr-radius-intensity");
    return saved ? Number(saved) : 12;
  });
  const [rightTab, setRightTab] = useState<"settings" | "logs" | "fonts">("logs");

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
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const t: number = await invoke("get_render_threads");
        if (!cancelled) { setRenderThreads(t); setThreadEditValue(String(t)); }
      } catch {}
    })();

    // 恢复毛玻璃强度
    const savedGlass = localStorage.getItem("nr-glass-intensity");
    if (savedGlass) {
      const v = Number(savedGlass);
      setGlassIntensity(v);
      document.documentElement.style.setProperty("--glass-blur", v + "px");
    }
    // 恢复圆角强度
    const savedRadius = localStorage.getItem("nr-radius-intensity");
    if (savedRadius) {
      const v = Number(savedRadius);
      setRadiusIntensity(v);
      // 根据圆角强度设置各令牌
      const sm = Math.max(2, Math.round(v * 0.5));
      const md = v;
      const lg = Math.min(32, Math.round(v * 1.4));
      const xl = Math.min(40, Math.round(v * 2));
      document.documentElement.style.setProperty("--radius-sm", sm + "px");
      document.documentElement.style.setProperty("--radius-md", md + "px");
      document.documentElement.style.setProperty("--radius-lg", lg + "px");
      document.documentElement.style.setProperty("--radius-xl", xl + "px");
    }

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
    if (scanning) {
      // 发送取消请求
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("cancel_scan");
      } catch {}
      setScanning(false);
      console.log("[墨读] 用户主动停止扫描");
      return;
    }
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
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.35)", backdropFilter: `blur(${glassIntensity}px) saturate(1.4)`, WebkitBackdropFilter: `blur(${glassIntensity}px) saturate(1.4)`, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDebugPanelOpen(false)}>
      <div style={{ width: "88vw", height: "82vh", maxWidth: 960, background: "var(--glass-bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
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
          <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} disabled={!libraryPath} onClick={handleScan}>{scanning ? "⏳ 扫描中..点击停止" : "🔄 扫描书库"}</button>
            <button className="btn" style={{ width: "100%", marginBottom: 5, justifyContent: "center", fontSize: ".78rem" }} onClick={() => { clearLogs(); setLogs([]); }}>🗑️ 清除日志</button>
            <div style={{ borderTop: "1px solid var(--border-glass)", margin: "14px 0 10px" }} />
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text)", fontSize: ".88rem" }}>面板</div>
            {(["settings", "logs", "fonts"] as const).map((tab) => (
              <button key={tab} className="btn" style={{ width: "100%", justifyContent: "center", fontSize: ".78rem", marginBottom: 4, background: rightTab === tab ? "rgba(var(--accent-rgb),0.12)" : undefined, border: rightTab === tab ? "1px solid rgba(var(--accent-rgb),0.3)" : undefined }}
                onClick={() => setRightTab(tab)}>
                {tab === "settings" ? "⚙️ 设置" : tab === "logs" ? "📋 日志" : "🔤 字体"}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {rightTab === "settings" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
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
                      style={{ width: 80, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "2px 8px", fontSize: ".75rem", textAlign: "center", outline: "none" }}
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
                  <span>72</span><span>|</span><span>100</span><span>|</span><span>150</span><span>|</span><span>200</span><span>|</span><span>250</span><span>|</span><span>300</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", margin: "16px 0 4px" }}>
                  <span style={{ color: "var(--text)" }}>🧵 PDF 渲染线程</span>
                  {threadEditing ? (
                    <input
                      type="number" min={1} max={16}
                      value={threadEditValue}
                      onChange={(e) => setThreadEditValue(e.target.value)}
                      onBlur={async () => {
                        const v = Math.min(16, Math.max(1, Math.round(Number(threadEditValue)) || 1));
                        setRenderThreads(v);
                        setThreadEditValue(String(v));
                        setThreadEditing(false);
                        try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_render_threads", { threads: v }); console.log(`[墨读] 渲染线程已设为 ${v}`); } catch {}
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setThreadEditing(false); setThreadEditValue(String(renderThreads)); } }}
                      style={{ width: 60, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "2px 8px", fontSize: ".75rem", textAlign: "center", outline: "none" }}
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={() => { setThreadEditing(true); setThreadEditValue(String(renderThreads)); }}
                      style={{ color: "var(--accent)", fontWeight: 600, cursor: "pointer", borderBottom: "1px dashed var(--accent)" }}
                      title="点击输入精确值"
                    >{renderThreads} 线程</span>
                  )}
                </div>
                <input
                  type="range" min={1} max={16} step={1} value={renderThreads}
                  onChange={async (e) => {
                    const v = Number(e.target.value);
                    setRenderThreads(v);
                    setThreadEditValue(String(v));
                    try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_render_threads", { threads: v }); console.log(`[墨读] 渲染线程已设为 ${v}`); } catch {}
                  }}
                  style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "var(--text-dim)", marginTop: 0, padding: "0 2px", userSelect: "none" }}>
                  <span>1</span><span>|</span><span>4</span><span>|</span><span>8</span><span>|</span><span>12</span><span>|</span><span>16</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", margin: "16px 0 4px" }}>
                  <span style={{ color: "var(--text)" }}>🔍 毛玻璃强度</span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>{glassIntensity}px</span>
                </div>
                <input
                  type="range" min={4} max={48} step={1} value={glassIntensity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setGlassIntensity(v);
                    localStorage.setItem("nr-glass-intensity", String(v));
                    document.documentElement.style.setProperty("--glass-blur", v + "px");
                    console.log(`[墨读] 毛玻璃强度已设为 ${v}px`);
                  }}
                  style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "var(--text-dim)", marginTop: 0, padding: "0 2px", userSelect: "none" }}>
                  <span>4（清晰）</span><span>|</span><span>12</span><span>|</span><span>24</span><span>|</span><span>36</span><span>|</span><span>48（模糊）</span>
                </div>
                <div style={{ borderTop: "1px solid var(--border-glass)", margin: "16px 0 10px" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", margin: "0 0 4px" }}>
                  <span style={{ color: "var(--text)" }}>📐 圆角强度</span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>{radiusIntensity}px</span>
                </div>
                <input
                  type="range" min={2} max={24} step={1} value={radiusIntensity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRadiusIntensity(v);
                    localStorage.setItem("nr-radius-intensity", String(v));
                    const sm = Math.max(2, Math.round(v * 0.5));
                    const md = v;
                    const lg = Math.min(32, Math.round(v * 1.4));
                    const xl = Math.min(40, Math.round(v * 2));
                    document.documentElement.style.setProperty("--radius-sm", sm + "px");
                    document.documentElement.style.setProperty("--radius-md", md + "px");
                    document.documentElement.style.setProperty("--radius-lg", lg + "px");
                    document.documentElement.style.setProperty("--radius-xl", xl + "px");
                    console.log(`[墨读] 圆角强度已设为 ${v}px（sm=${sm} md=${md} lg=${lg} xl=${xl})`);
                  }}
                  style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "var(--text-dim)", marginTop: 0, padding: "0 2px", userSelect: "none" }}>
                  <span>2（直角）</span><span>|</span><span>8</span><span>|</span><span>12</span><span>|</span><span>18</span><span>|</span><span>24（圆润）</span>
                </div>
                <button className="btn" style={{ width: "100%", justifyContent: "center", fontSize: ".78rem", marginTop: 12 }} onClick={async () => {
                  try { const { invoke } = await import("@tauri-apps/api/core"); const dir: string = await invoke("get_comics_dir"); await invoke("open_file_location", { path: dir }); } catch {}
                }}>📁 打开渲染目录</button>
                <button className="btn" style={{ width: "100%", justifyContent: "center", fontSize: ".78rem", marginTop: 16 }} onClick={async () => { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_render_dpi", { dpi: 150 }); } catch {} setRenderDpi(150); try { localStorage.clear(); window.location.reload(); } catch {} }}>🔄 重置所有设置</button>
              </div>
            )}
            {rightTab === "logs" && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px", borderBottom: "1px solid var(--border-glass)", flexShrink: 0, gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: ".8rem", color: "var(--text-dim)" }}>日志输出 ({displayLogs.length} 条)</span>
                    <span style={{ fontSize: ".68rem", color: "var(--text-dim)", opacity: 0.4 }}>(共 {logs.length} 条)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <select value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)} style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "3px 8px", fontSize: ".75rem", outline: "none", cursor: "pointer" }}>
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
              </>
            )}
            {rightTab === "fonts" && <FontSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== FontSettings — 字体设置子面板（普通 select，不折腾） =====
const FONT_OPTIONS = [
  { value: "", label: "默认衬线" },
  { value: "'PingFang SC','Microsoft YaHei',sans-serif", label: "无衬线" },
  { value: "'STSong','SimSun',serif", label: "宋体" },
  { value: "'KaiTi','STKaiti',serif", label: "楷体" },
  { value: "'FangSong','STFangsong',serif", label: "仿宋" },
  { value: "'Source Han Serif SC','Noto Serif CJK SC',serif", label: "思源宋体" },
  { value: "'LXGW WenKai','STKaiti',serif", label: "霞鹜文楷" },
  { value: "'ZCOOL XiaoWei','Noto Serif SC',serif", label: "站酷小魏体" },
  { value: "'ZCOOL QingKe HuangYou','PingFang SC',sans-serif", label: "站酷清刻黄油体" },
  { value: "'Ma Shan Zheng','STKaiti',serif", label: "马善政楷书" },
  { value: "'Liu Jian Mao Cao','STKaiti',cursive", label: "柳建毛草体" },
  { value: "'ZCOOL KuaiLe',sans-serif", label: "站酷快乐体" },
];
const FONT_SIZES = [
  { value: ".5rem", label: "八号" },    { value: ".55rem", label: "七号" },
  { value: ".63rem", label: "小六" },   { value: ".7rem",  label: "六号" },
  { value: ".75rem", label: "小五" },   { value: ".8rem",  label: "五号" },
  { value: ".88rem", label: "小四" },   { value: ".94rem", label: "四号" },
  { value: "1rem",   label: "小三" },   { value: "1.06rem",label: "三号" },
  { value: "1.2rem", label: "小二号" }, { value: "1.38rem",label: "二号" },
  { value: "1.5rem", label: "小一号" }, { value: "1.75rem",label: "一号" },
];

function FontSettings() {
  const storeReaderFont = useStore((s) => s.readerFont);
  const setStoreReaderFont = useStore((s) => s.setReaderFont);

  // 全部用局部 state + localStorage，不依赖 CSS 变量
  const [readerFont, setReaderFont] = useState(() => localStorage.getItem("nr-reader-font") || "");
  const [readerSize, setReaderSize] = useState(() => Number(localStorage.getItem("nr-font-reader-size")) || 8);
  const [titleFont, setTitleFont] = useState(() => localStorage.getItem("nr-font-title") || "");
  const [uiFont, setUiFont] = useState(() => localStorage.getItem("nr-font-ui") || "");
  const [titleSize, setTitleSize] = useState(() => Number(localStorage.getItem("nr-font-title-size")) || 5);
  const [uiSize, setUiSize] = useState(() => Number(localStorage.getItem("nr-font-ui-size")) || 5);
  const [titleBold, setTitleBold] = useState(() => localStorage.getItem("nr-font-title-bold") !== "0");
  const [readerBold, setReaderBold] = useState(() => localStorage.getItem("nr-font-reader-bold") !== "0");
  const [uiBold, setUiBold] = useState(() => localStorage.getItem("nr-font-ui-bold") !== "0");

  function setBoth(which: "reader" | "title" | "ui", v: string) {
    const key = which === "reader" ? "nr-reader-font" : which === "title" ? "nr-font-title" : "nr-font-ui";
    const setter = which === "reader" ? setReaderFont : which === "title" ? setTitleFont : setUiFont;
    localStorage.setItem(key, v);
    setter(v);
    if (which === "reader") {
      setStoreReaderFont(v);
      document.documentElement.style.setProperty("--font-reader", v || "'Georgia','Noto Serif SC',serif");
    } else if (which === "title") {
      document.documentElement.style.setProperty("--font-title", v || "'Georgia','Noto Serif SC',serif");
    } else {
      document.documentElement.style.setProperty("--font-ui", v || "inherit");
    }
  }

  const readFontFace = readerFont || "'Georgia','Noto Serif SC',serif";
  const titleFontFace = titleFont || "'Georgia','Noto Serif SC',serif";
  const uiFontFace = uiFont || "inherit";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        <div style={{ maxWidth: 500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
          {/* 阅读器字体 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: ".82rem", color: "var(--text)", fontWeight: 600 }}>📖 阅读器字体</span>
              <label style={{ fontSize: ".72rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={readerBold} onChange={() => { const v = !readerBold; setReaderBold(v); localStorage.setItem("nr-font-reader-bold", v ? "1" : "0"); document.documentElement.style.setProperty("--font-reader-weight", v ? "700" : "400"); }} style={{ accentColor: "var(--accent)" }} /> 加粗
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}><FontSelect value={readerFont} onChange={(v) => setBoth("reader", v)} /></div>
              <select value={readerSize} onChange={(e) => { const i = Number(e.target.value); setReaderSize(i); localStorage.setItem("nr-font-reader-size", String(i)); document.documentElement.style.setProperty("--font-reader-size", FONT_SIZES[i].value); }}
                style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "6px 8px", fontSize: ".78rem", outline: "none", cursor: "pointer" }}>
                {FONT_SIZES.map((sz, i) => (<option key={i} value={i}>{sz.label}</option>))}
              </select>
            </div>
          </div>

          {/* 标题栏字体 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: ".82rem", color: "var(--text)", fontWeight: 600 }}>📰 标题栏字体</span>
              <label style={{ fontSize: ".72rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={titleBold} onChange={() => { const v = !titleBold; setTitleBold(v); localStorage.setItem("nr-font-title-bold", v ? "1" : "0"); document.documentElement.style.setProperty("--font-title-weight", v ? "700" : "600"); }} style={{ accentColor: "var(--accent)" }} /> 加粗
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}><FontSelect value={titleFont} onChange={(v) => setBoth("title", v)} /></div>
              <select value={titleSize} onChange={(e) => { const i = Number(e.target.value); setTitleSize(i); localStorage.setItem("nr-font-title-size", String(i)); document.documentElement.style.setProperty("--font-title-size", FONT_SIZES[i].value); }}
                style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "6px 8px", fontSize: ".78rem", outline: "none", cursor: "pointer" }}>
                {FONT_SIZES.map((sz, i) => (<option key={i} value={i}>{sz.label}</option>))}
              </select>
            </div>
          </div>

          {/* UI 组件字体 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: ".82rem", color: "var(--text)", fontWeight: 600 }}>🖥️ UI 组件字体</span>
              <label style={{ fontSize: ".72rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={uiBold} onChange={() => { const v = !uiBold; setUiBold(v); localStorage.setItem("nr-font-ui-bold", v ? "1" : "0"); document.documentElement.style.setProperty("--font-ui-weight", v ? "700" : "400"); }} style={{ accentColor: "var(--accent)" }} /> 加粗
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}><FontSelect value={uiFont} onChange={(v) => setBoth("ui", v)} /></div>
              <select value={uiSize} onChange={(e) => { const i = Number(e.target.value); setUiSize(i); localStorage.setItem("nr-font-ui-size", String(i)); document.documentElement.style.setProperty("--font-ui-size", FONT_SIZES[i].value); }}
                style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "6px 8px", fontSize: ".78rem", outline: "none", cursor: "pointer" }}>
                {FONT_SIZES.map((sz, i) => (<option key={i} value={i}>{sz.label}</option>))}
              </select>
            </div>
          </div>

          {/* 预览 */}
          <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: 20 }}>
            <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 10 }}>📰 标题栏预览</div>
            <div style={{ background: "var(--glass-bg)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "14px 20px" }}>
              <div style={{ fontFamily: titleFontFace, fontSize: FONT_SIZES[titleSize].value, fontWeight: titleBold ? 700 : 600, color: "var(--text)" }}>墨读</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 10 }}>📖 阅读正文预览</div>
            <div style={{ background: "var(--reader-bg)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "20px 24px", lineHeight: 1.9 }}>
              <p style={{ fontFamily: readFontFace, fontSize: FONT_SIZES[readerSize].value, fontWeight: readerBold ? 700 : 400, color: "var(--text)", margin: 0, textIndent: "2em" }}>
                却说那唐僧在马上，手指远处道："悟空，你看那山色青翠，好似有仙家之气。"行者笑道："师父好眼力！那山唤作浮云山，乃是五百年前老君炼丹之所。"</p>
              <p style={{ fontFamily: readFontFace, fontSize: FONT_SIZES[readerSize].value, fontWeight: readerBold ? 700 : 400, color: "var(--text)", margin: "8px 0 0", textIndent: "2em" }}>
                沙僧道："大师兄，这山中可有什么妖怪？"行者摆手道："莫怕莫怕，有俺老孙在，天塌下来也顶得住！"</p>
            </div>
          </div>

          <div>
            <div style={{ fontSize: ".78rem", color: "var(--text-dim)", marginBottom: 10 }}>🖥️ UI 组件预览</div>
            <div style={{
              background: "var(--glass-bg)", border: "1px solid var(--border-glass)",
              borderRadius: "var(--radius-md)", padding: "16px 20px",
              display: "flex", flexDirection: "column", gap: 12,
              fontFamily: uiFontFace,
              fontSize: FONT_SIZES[uiSize].value,
              fontWeight: uiBold ? 700 : 400,
            }}>
              {/* 导航标签 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ padding: "6px 14px", background: "rgba(var(--accent-rgb),0.12)", borderRadius: "var(--radius-sm)", color: "var(--text)", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--accent-rgb),0.22)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(var(--accent-rgb),0.12)"}>📖 小说</span>
                <span style={{ padding: "6px 14px", color: "var(--text-dim)", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-dim)"}>🎴 漫画</span>
                <span style={{ padding: "6px 14px", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", color: "var(--text)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <span>☀️</span><span>导入</span><span>⋯</span>
                </span>
              </div>
              {/* 按钮行 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" style={{ fontSize: "inherit", fontWeight: uiBold ? 700 : 400, fontFamily: "inherit" }}>📂 更改路径</button>
                <button className="btn" style={{ fontSize: "inherit", fontWeight: uiBold ? 700 : 400, fontFamily: "inherit" }}>🔄 扫描书库</button>
                <button className="btn" style={{ fontSize: "inherit", fontWeight: uiBold ? 700 : 400, fontFamily: "inherit" }}>🗑️ 清除日志</button>
              </div>
              {/* 下拉 + 输入框 */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "6px 8px", fontSize: "inherit", fontFamily: "inherit", fontWeight: uiBold ? 700 : 400, outline: "none", cursor: "pointer" }}>
                  <option>全部来源</option>
                  <option>仅前端</option>
                </select>
                <label style={{ fontSize: ".9em", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} /> 自动滚动
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 普通 select 字体下拉 */
function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)", padding: "6px 8px", fontSize: ".82rem", outline: "none", cursor: "pointer" }}>
      {FONT_OPTIONS.map((f) => (
        <option key={f.value} value={f.value}>{f.label}</option>
      ))}
    </select>
  );
}