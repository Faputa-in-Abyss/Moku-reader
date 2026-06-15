import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import {
  LegadoSource, extractValue, extractList, applyReplaceRegex,
  parseSearchUrl
} from "./LegadoEngine";

// ===== 数据结构 =====

interface SearchResult {
  title: string;
  author: string;
  url: string;
  source: string;
  cover_url?: string;
  description?: string;
  book_id?: string;
}

const DB_KEY = "nr-book-sources-v2";

function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function loadSources(): LegadoSource[] {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem("nr-book-sources");
    if (old) { localStorage.removeItem("nr-book-sources"); }
  } catch {}
  // 默认没有内置书源（因大多数网站有反爬），请从书源仓库导入
  return [];
}

function saveSources(sources: LegadoSource[]) {
  localStorage.setItem(DB_KEY, JSON.stringify(sources));
}

// ===== 执行规则搜索 =====

async function executeSearch(src: LegadoSource, keyword: string): Promise<SearchResult[]> {
  const { invoke } = await import("@tauri-apps/api/core");

  // 解析 searchUrl
  const rawUrl = src.searchUrl || src.ruleSearchUrl || "";
  if (!rawUrl) return [];

  const parsed = parseSearchUrl(rawUrl, keyword, 1);

  // 构建完整 URL
  const base = src.bookSourceUrl.replace(/\/+$/, "");
  const fullUrl = parsed.url.startsWith("http") ? parsed.url : base + parsed.url;

  let html: string;
  if (parsed.method === "POST") {
    html = await invoke("fetch_url", { url: fullUrl, method: "POST", body: parsed.body || "", referer: base + "/" } as any);
  } else {
    html = await invoke("fetch_url", { url: fullUrl, referer: base + "/" });
  }

  if (!html.trim()) return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const baseUrl = fullUrl;

  // 获取 bookList
  let listRule: string | undefined;
  let nameRule: string | undefined;
  let authorRule: string | undefined;
  let urlRule: string | undefined;
  let coverRule: string | undefined;
  let introRule: string | undefined;

  // 先检查 V3 扁平格式
  if (src.ruleSearchList) listRule = src.ruleSearchList;
  if (src.ruleSearchName) nameRule = src.ruleSearchName;
  if (src.ruleSearchAuthor) authorRule = src.ruleSearchAuthor;
  if (src.ruleSearchNoteUrl) urlRule = src.ruleSearchNoteUrl;
  if (src.ruleSearchCoverUrl) coverRule = src.ruleSearchCoverUrl;

  // 再检查 V2 对象格式
  const rs = src.ruleSearch;
  if (typeof rs === 'object') {
    if (!listRule && rs.bookList) listRule = rs.bookList as any;
    if (!nameRule && rs.name) nameRule = rs.name;
    if (!authorRule && rs.author) authorRule = rs.author;
    if (!urlRule && rs.bookUrl) urlRule = rs.bookUrl;
    if (!coverRule && rs.coverUrl) coverRule = rs.coverUrl;
    if (!introRule && rs.intro) introRule = rs.intro;
  }

  if (!listRule || !nameRule) return [];

  const items = extractList(doc, listRule);
  const results: SearchResult[] = [];

  for (const item of items) {
    const title = nameRule ? extractValue(item, nameRule) : "";
    if (!title) continue;
    const author = authorRule ? extractValue(item, authorRule) : "";
    const url = urlRule ? extractValue(item, urlRule, baseUrl) : "";
    const cover = coverRule ? extractValue(item, coverRule, baseUrl) : "";
    const desc = introRule ? extractValue(item, introRule) : "";

    results.push({
      title,
      author,
      url,
      source: src.bookSourceName,
      cover_url: cover,
      description: desc,
    });
  }

  return results;
}

// ===== 下载流程 =====

async function downloadBookFromSource(
  src: LegadoSource, item: SearchResult,
  onProgress: (msg: string) => void
): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");

  // 1. 获取书籍详情页 HTML
  const base = src.bookSourceUrl.replace(/\/+$/, "");
  const tocUrl = item.url.startsWith("http") ? item.url : base + item.url;

  onProgress("正在获取目录...");
  let html: string;
  try {
    html = await invoke("fetch_url", { url: tocUrl });
  } catch (e: any) {
    throw new Error(`获取目录失败: ${e}`);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  // 2. 获取章节列表规则
  let chapterListRule: string | undefined;
  let chapterNameRule: string | undefined;
  let chapterUrlRule: string | undefined;

  // V3 扁平
  if (src.ruleChapterList) chapterListRule = src.ruleChapterList;
  if (src.ruleChapterName) chapterNameRule = src.ruleChapterName;
  if (src.ruleChapterUrl) chapterUrlRule = src.ruleChapterUrl;

  // V2 对象
  const rt = src.ruleToc;
  if (typeof rt === 'object') {
    if (!chapterListRule && rt.chapterList) chapterListRule = rt.chapterList;
    if (!chapterNameRule && rt.chapterName) chapterNameRule = rt.chapterName;
    if (!chapterUrlRule && rt.chapterUrl) chapterUrlRule = rt.chapterUrl;
  }

  if (!chapterListRule) throw new Error("书源未配置目录规则");

  // 3. 解析章节列表
  const chapterLinks = extractList(doc, chapterListRule);
  if (chapterLinks.length === 0) throw new Error("未找到章节列表");

  // 4. 获取正文规则
  let contentRule: string | undefined;
  let replaceRegex: string[] | string[][] | undefined;
  const rc = src.ruleContent;
  if (typeof rc === 'object') {
    contentRule = rc.content;
    replaceRegex = rc.replaceRegex;
  }
  if (src.ruleBookContent) contentRule = src.ruleBookContent;
  if (!contentRule) throw new Error("书源未配置正文规则");

  onProgress(`共 ${chapterLinks.length} 章`);

  // 5. 逐章下载
  let fullText = `${item.title}\n作者：${item.author || "未知"}\n来源：${src.bookSourceName}\n\n`;
  const batchSize = 3;

  for (let start = 0; start < chapterLinks.length; start += batchSize) {
    const end = Math.min(start + batchSize, chapterLinks.length);
    const batch = chapterLinks.slice(start, end);

    const batchPromises = batch.map(async (chEl, bi) => {
      const idx = start + bi;
      const chTitle = chapterNameRule
        ? extractValue(chEl, chapterNameRule)
        : (chEl.textContent?.trim() || `第${idx + 1}章`);
      const chUrl = chapterUrlRule
        ? extractValue(chEl, chapterUrlRule)
        : (chEl.getAttribute('href') || '');

      if (!chUrl) return `\n${chTitle}\n(无链接)\n\n`;

      const fullChUrl = chUrl.startsWith("http") ? chUrl : base + chUrl;
      try {
        const chHtml: string = await invoke("fetch_url", { url: fullChUrl, referer: item.url });
        const chDoc = new DOMParser().parseFromString(chHtml, "text/html");
        let chContent = extractValue(chDoc, contentRule);
        if (replaceRegex) chContent = applyReplaceRegex(chContent, replaceRegex);
        chContent = chContent
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<p[^>]*>/gi, "")
          .replace(/<\/p>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        return `\n${chTitle}\n${chContent || "(内容为空)"}\n\n`;
      } catch {
        return `\n${chTitle}\n(下载失败)\n\n`;
      }
    });

    const rs = await Promise.all(batchPromises);
    fullText += rs.join("");
    onProgress(`${end}/${chapterLinks.length} 章`);
  }

  onProgress("保存中...");
  await invoke("save_online_book", { title: item.title, author: item.author, content: fullText });
  return fullText;
}

// ===== 组件 =====

export default function OnlineSearch() {
  const onlineSearchOpen = useStore((s) => s.onlineSearchOpen);
  const setOnlineSearchOpen = useStore((s) => s.setOnlineSearchOpen);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [sources, setSources] = useState<LegadoSource[]>(loadSources);
  const [activeSource, setActiveSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [showManager, setShowManager] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sources.length > 0 && !activeSource) setActiveSource(sources[0].id || sources[0].bookSourceName);
  }, [sources, activeSource]);
  useEffect(() => {
    if (onlineSearchOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [onlineSearchOpen]);

  const currentSource = sources.find((s) => (s.id as any) === activeSource || s.bookSourceName === activeSource) || sources[0];

  // ===== 搜索 =====
  const doSearch = useCallback(async () => {
    if (!keyword.trim()) { setError("请输入关键词"); return; }
    if (!currentSource) { setError("请先选择书源"); return; }
    setSearching(true); setError(""); setResults([]);
    try {
      const list = await executeSearch(currentSource, keyword.trim());
      if (list.length === 0) setError("未找到结果");
      setResults(list);
    } catch (e: any) { setError(String(e)); }
    setSearching(false);
  }, [keyword, currentSource]);

  // ===== 批量搜索 =====
  const doBatchSearch = useCallback(async () => {
    if (!keyword.trim()) { setError("请输入关键词"); return; }
    setSearching(true); setError(""); setResults([]);
    const enabledSources = sources.filter((s) => s.enabled !== false);
    const promises = enabledSources.map((src) =>
      executeSearch(src, keyword.trim()).catch(() => [] as SearchResult[])
    );
    const allArrays = await Promise.all(promises);
    let allResults: SearchResult[] = [];
    for (const list of allArrays) {
      for (const item of list) {
        if (!allResults.find((r) => r.title === item.title && r.author === item.author)) {
          allResults.push(item);
        }
      }
    }
    if (allResults.length === 0) setError("所有书源均未找到结果");
    setResults(allResults);
    setSearching(false);
  }, [keyword, sources]);

  // ===== 下载 =====
  const downloadBook = useCallback(async (item: SearchResult) => {
    const src = sources.find((s) => s.bookSourceName === item.source);
    if (!src) { setError("未找到对应书源"); return; }
    setDownloading(true); setDownloadProgress("开始下载...");
    try {
      await downloadBookFromSource(src, item, (msg) => setDownloadProgress(msg));
      triggerRefresh();
      setDownloadProgress("✅ 下载完成！");
      setTimeout(() => { setDownloading(false); setDownloadProgress(""); }, 2000);
    } catch (e: any) {
      setError(String(e));
      setDownloading(false);
      setDownloadProgress("");
    }
  }, [sources, triggerRefresh]);

  // ===== 导入书源 =====
  const importFromUrl = useCallback(async () => {
    if (!importUrl.trim()) { setError("请输入书源 JSON 地址"); return; }
    setImporting(true); setError("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const jsonText: string = await invoke("fetch_url", { url: importUrl.trim() });
      const data = JSON.parse(jsonText);
      const list = Array.isArray(data) ? data : [data];
      let imported = 0;
      const next = [...sources];
      for (const item of list) {
        if (!item.bookSourceName) continue;
        if (next.find((s) => s.bookSourceName === item.bookSourceName)) continue;
        (item as any).id = genId();
        next.push(item);
        imported++;
      }
      if (imported > 0) { setSources(next); saveSources(next); setImportUrl(""); }
      setImporting(false);
      setError(imported > 0 ? `✅ 导入 ${imported} 个书源` : "未导入任何书源");
      if (imported > 0) setTimeout(() => setError(""), 3000);
    } catch (e: any) { setError("导入失败: " + String(e)); setImporting(false); }
  }, [importUrl, sources]);

  if (!onlineSearchOpen) return null;

  const enableBatch = sources.filter((s) => s.enabled !== false).length > 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setOnlineSearchOpen(false)}>
      <div style={{ width: "85vw", height: "80vh", maxWidth: 900, background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border-glass)", flexShrink: 0 }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text)" }}>📚 联网搜书</span>
          <button className="btn" style={{ padding: "4px 10px", fontSize: ".8rem" }} onClick={() => setOnlineSearchOpen(false)}>✕ 关闭</button>
        </div>

        {/* 搜索栏 */}
        <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: "1px solid var(--border-glass)", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          <select value={activeSource} onChange={(e) => setActiveSource(e.target.value)} style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "7px 10px", fontSize: ".82rem", outline: "none", cursor: "pointer", maxWidth: 140 }}>
            {sources.filter(s => s.enabled !== false).map((s) => (
              <option key={s.bookSourceName} value={s.bookSourceName}>{s.bookSourceName}</option>
            ))}
          </select>

          <input ref={inputRef} type="text" placeholder="输入小说名称..." value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()}
            style={{ flex: 1, minWidth: 120, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem", outline: "none" }} />

          <button className="btn btn-primary" onClick={doSearch} disabled={searching || !keyword.trim()} style={{ fontSize: ".82rem", padding: "7px 14px" }}>
            {searching ? "搜索中..." : "🔍 搜索"}
          </button>

          {enableBatch && (
            <button className="btn" onClick={doBatchSearch} disabled={searching || !keyword.trim()} style={{ fontSize: ".78rem", padding: "7px 10px" }}>
              ⚡ 批量
            </button>
          )}

          <button className="btn" onClick={() => setShowManager(!showManager)} style={{ fontSize: ".78rem", padding: "7px 10px" }}>
            ⚙️ 管理
          </button>
        </div>

        {/* 管理面板 */}
        {showManager && (
          <div style={{ borderBottom: "1px solid var(--border-glass)", padding: "10px 20px", flexShrink: 0, maxHeight: "50%", overflow: "auto" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://...json (书源 API 地址)" style={{ flex: 1, minWidth: 150, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 6, padding: "5px 10px", fontSize: ".74rem", outline: "none" }} />
              <button className="btn btn-primary" onClick={importFromUrl} disabled={importing || !importUrl.trim()} style={{ fontSize: ".72rem", padding: "5px 12px" }}>{importing ? "..." : "导入"}</button>
            </div>
            <div style={{ fontSize: ".74rem", color: "var(--text-dim)", marginBottom: 6 }}>
              {sources.length} 个书源
            </div>
            {sources.map((s) => (
              <div key={s.bookSourceName} style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px", fontSize: ".74rem", borderBottom: "1px solid var(--border-glass)", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--text)", fontSize: s.enabled !== false ? undefined : "var(--text-dim)", opacity: s.enabled !== false ? 1 : 0.5 }}>{s.bookSourceName}</span>
                  <span style={{ color: "var(--text-dim)", fontSize: ".64rem" }}>{s.bookSourceUrl}</span>
                </div>
                <button className="btn" style={{ padding: "1px 8px", fontSize: ".64rem", color: "#e06060" }} onClick={() => {
                  const next = sources.filter((x) => x.bookSourceName !== s.bookSourceName);
                  setSources(next); saveSources(next);
                }}>删除</button>
              </div>
            ))}
          </div>
        )}

        {/* 结果列表 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {error && <div style={{ padding: "10px 24px", color: "#e06060", fontSize: ".78rem" }}>{error}</div>}
          {results.length === 0 && !searching && !error && (
            <div style={{ color: "var(--text-dim)", opacity: 0.35, textAlign: "center", paddingTop: 60, fontSize: ".85rem" }}>
              输入书名开始搜索
            </div>
          )}
          {results.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", borderBottom: "1px solid var(--border-glass)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--accent-rgb),0.03)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--text)", fontSize: ".9rem", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                <div style={{ color: "var(--text-dim)", fontSize: ".72rem", display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{item.author || "未知作者"}</span>
                  <span>·</span>
                  <span>{item.source}</span>
                </div>
                {item.description && (
                  <div style={{ color: "var(--text-dim)", fontSize: ".7rem", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
                    {item.description}
                  </div>
                )}
              </div>
              <button className="btn" style={{ flexShrink: 0, padding: "5px 14px", fontSize: ".75rem" }} onClick={() => downloadBook(item)} disabled={downloading}>
                {downloading ? "下载中..." : "下载"}
              </button>
            </div>
          ))}
        </div>

        {downloadProgress && (
          <div style={{ padding: "8px 24px", borderTop: "1px solid var(--border-glass)", fontSize: ".75rem", color: "var(--accent)", flexShrink: 0 }}>
            {downloadProgress}
          </div>
        )}
      </div>
    </div>
  );
}
