import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

export interface BookSource {
  id: string;
  name: string;
  searchUrl: string;
  listRule: string;
  titleRule: string;
  authorRule: string;
  linkRule: string;
  chapterListRule: string;
  chapterTitleRule: string;
  contentRule: string;
  removeSelectors: string[];
}

interface SearchResult {
  title: string;
  author: string;
  url: string;
  source: string;
}

const STORAGE_KEY = "nr-book-sources";

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadSources(): BookSource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [{
    id: "biquge", name: "笔趣阁 (示例)",
    searchUrl: "https://www.biquge.tv/search?q={{key}}",
    listRule: ".result-item, .search-list li, .book-result li, .list-group-item, .search-result li",
    titleRule: "a, h3, .title, .book-name, .result-item-title",
    authorRule: ".author, span:nth-child(2), .book-author, .result-item-author",
    linkRule: "a",
    chapterListRule: "#list a, .chapter-list a, .book-list a, ul.chapter a, ul.chapter-list a, #chapter-list a",
    chapterTitleRule: "a",
    contentRule: "#content, .content, .read-content, .chapter-content, #chaptercontent, .content-body, #booktxt",
    removeSelectors: [".ad", ".advert", "script", "style", ".recommend", ".footer", ".header"],
  }];
}

function saveSources(sources: BookSource[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function qs(el: Element | Document, sel: string): Element | null {
  if (!sel) return null;
  try { return el.querySelector(sel); } catch { return null; }
}

function qsa(el: Element | Document, sel: string): Element[] {
  if (!sel) return [];
  try { return Array.from(el.querySelectorAll(sel)); } catch { return []; }
}

function text(el: Element | Document, sel: string): string {
  const found = qs(el, sel);
  return found?.textContent?.trim() || "";
}

function absUrl(base: string, href: string): string {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  try { return new URL(href, base).href; } catch { return href; }
}

async function searchSource(keyword: string, src: BookSource): Promise<SearchResult[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  const url = src.searchUrl.replace("{{key}}", encodeURIComponent(keyword));
  const html: string = await invoke("fetch_url", { url });
  const doc = parseHtml(html);
  const items = qsa(doc, src.listRule);
  const list: SearchResult[] = [];
  for (const item of items) {
    const linkEl = qs(item, src.linkRule);
    const href = linkEl?.getAttribute("href") || "";
    const title = text(item, src.titleRule);
    const author = text(item, src.authorRule);
    if (title) {
      list.push({ title, author, url: absUrl(url, href), source: src.name });
    }
  }
  return list;
}

export default function OnlineSearch() {
  const onlineSearchOpen = useStore((s) => s.onlineSearchOpen);
  const setOnlineSearchOpen = useStore((s) => s.setOnlineSearchOpen);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [sources, setSources] = useState<BookSource[]>(loadSources);
  const [activeSource, setActiveSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [showManager, setShowManager] = useState(false);
  const [editingSource, setEditingSource] = useState<BookSource | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sources.length > 0 && !activeSource) setActiveSource(sources[0].id);
  }, [sources, activeSource]);
  useEffect(() => {
    if (onlineSearchOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [onlineSearchOpen]);

  const currentSource = sources.find((s) => s.id === activeSource) || sources[0];

  const doSearch = async () => {
    if (!keyword.trim() || !currentSource?.searchUrl) { setError("请先选择或配置书源"); return; }
    setSearching(true); setError(""); setResults([]);
    try {
      const list = await searchSource(keyword.trim(), currentSource);
      if (list.length === 0) setError("未找到结果，可能规则不匹配");
      setResults(list);
    } catch (e: any) { setError(String(e)); }
    setSearching(false);
  };

  const doBatchSearch = async () => {
    if (!keyword.trim()) { setError("请输入关键词"); return; }
    setSearching(true); setError(""); setResults([]);
    const validSources = sources.filter((s) => s.searchUrl);
    const promises = validSources.map((src) =>
      searchSource(keyword.trim(), src).catch(() => [] as SearchResult[])
    );
    const results = await Promise.all(promises);
    let allResults: SearchResult[] = [];
    for (const list of results) {
      for (const item of list) {
        if (!allResults.find((r) => r.title === item.title && r.author === item.author)) {
          allResults.push(item);
        }
      }
    }
    if (allResults.length === 0) setError("所有书源均未找到结果");
    setResults(allResults);
    setSearching(false);
  };

  const downloadBook = async (item: SearchResult) => {
    const src = sources.find((s) => s.name === item.source) || currentSource;
    if (!src?.chapterListRule || !src?.contentRule) { setError("书源未配置章节列表或正文规则"); return; }
    setDownloading(true); setDownloadProgress("正在获取章节列表...");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const tocHtml: string = await invoke("fetch_url", { url: item.url });
      const tocDoc = parseHtml(tocHtml);
      const chapterLinks = qsa(tocDoc, src.chapterListRule);
      if (chapterLinks.length === 0) { setError("未解析到章节列表"); setDownloading(false); return; }
      setDownloadProgress("共 " + chapterLinks.length + " 章");
      let fullText = item.title + "\n作者：" + (item.author || "未知") + "\n来源：" + item.source + "\n\n";
      const batchSize = 3;
      for (let start = 0; start < chapterLinks.length; start += batchSize) {
        const batch = chapterLinks.slice(start, start + batchSize);
        const batchPromises = batch.map(async (chEl, bi) => {
          const i = start + bi;
          const chUrl = chEl.getAttribute("href") || "";
          const chTitle = chEl.textContent?.trim() || "第" + (i + 1) + "章";
          const fullChUrl = absUrl(item.url, chUrl);
          try {
            const chHtml: string = await invoke("fetch_url", { url: fullChUrl });
            const chDoc = parseHtml(chHtml);
            for (const sel of src.removeSelectors) { for (const el of qsa(chDoc, sel)) el.remove(); }
            const contentEl = qs(chDoc, src.contentRule);
            let chContent = contentEl?.innerHTML?.trim() || "";
            chContent = chContent.replace(/<br\s*\/?>/gi, "\n").replace(/<p[^>]*>/gi, "").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
            return "\n" + chTitle + "\n" + (chContent || "(内容为空)") + "\n";
          } catch (e: any) { return "\n" + chTitle + "\n(下载失败)\n"; }
        });
        const rs = await Promise.all(batchPromises);
        fullText += rs.join("");
        setDownloadProgress(Math.min(start + batchSize, chapterLinks.length) + "/" + chapterLinks.length);
      }
      setDownloadProgress("保存中...");
      await invoke("save_online_book", { title: item.title, author: item.author, content: fullText });
      triggerRefresh();
      setDownloadProgress("OK");
      setTimeout(() => { setDownloading(false); setDownloadProgress(""); }, 1500);
    } catch (e: any) { setError(String(e)); setDownloading(false); setDownloadProgress(""); }
  };

  const openEdit = (src?: BookSource) => setEditingSource(src ? { ...src } : { id: genId(), name: "", searchUrl: "", listRule: "", titleRule: "", authorRule: "", linkRule: "", chapterListRule: "", chapterTitleRule: "", contentRule: "", removeSelectors: [] });
  const saveEdit = () => {
    if (!editingSource || !editingSource.name) return;
    const exists = sources.find((s) => s.id === editingSource.id);
    const next = exists ? sources.map((s) => s.id === editingSource.id ? editingSource : s) : [...sources, editingSource];
    setSources(next); saveSources(next); setEditingSource(null); setActiveSource(editingSource.id);
  };
  const deleteSource = (id: string) => {
    const next = sources.filter((s) => s.id !== id);
    setSources(next); saveSources(next);
    if (activeSource === id && next.length > 0) setActiveSource(next[0].id);
  };

  const importFromApi = async () => {
    if (!importUrl.trim()) { setError("请输入API地址"); return; }
    setImporting(true); setError("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const jsonText: string = await invoke("fetch_url", { url: importUrl.trim() });
      const data = JSON.parse(jsonText);
      const list = Array.isArray(data) ? data : [data];
      let imported = 0; const next = [...sources];
      for (const item of list) {
        if (!item.bookSourceUrl || !item.bookSourceName) continue;
        if (next.find((s) => s.name === item.bookSourceName)) continue;
        let searchUrl = item.searchUrl || "";
        if (!searchUrl || searchUrl.startsWith("@js:") || searchUrl.includes("{")) {
          searchUrl = item.bookSourceUrl.replace(/\/+$/, "") + "/search/{{key}}/1.html";
        }
        const rs = item.ruleSearch || {}; const rt = item.ruleToc || {}; const rc = item.ruleContent || {};
        const parseR = (r: string) => { if (!r) return ""; let s = r.split("||")[0]; s = s.replace(/<js>.*?<\/js>/g, ""); const p = s.split("@"); return p.length > 1 ? p.slice(0, -1).join(" ").replace(/\.\d+$/, "").trim() : s.replace(/\.\d+$/, "").trim(); };
        next.push({ id: genId(), name: item.bookSourceName, searchUrl: searchUrl.replace("{{key}}", "{{key}}"), listRule: parseR(rs.bookList) || ".search-result li, .result-item, ul li", titleRule: parseR(rs.name) || "a, h3", authorRule: parseR(rs.author) || "", linkRule: parseR(rs.bookUrl) || "a", chapterListRule: parseR(rt.chapterList) || "ul a, .chapter-list a", chapterTitleRule: parseR(rt.chapterName) || "a", contentRule: parseR(rc.content) || "#content, .content", removeSelectors: [".ad", ".advert", "script", "style"] });
        imported++;
      }
      if (imported > 0) { setSources(next); saveSources(next); setImportUrl(""); }
      setImporting(false);
      setError(imported > 0 ? "OK 导入 " + imported + " 个书源" : "未导入任何书源");
      if (imported > 0) setTimeout(() => setError(""), 3000);
    } catch (e: any) { setError("导入失败: " + String(e)); setImporting(false); }
  };

  if (!onlineSearchOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setOnlineSearchOpen(false)}>
      <div style={{ width: "85vw", height: "80vh", maxWidth: 900, background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border-glass)", boxShadow: "0 16px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border-glass)", flexShrink: 0 }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text)" }}>📚 联网搜书</span>
          <button className="btn" style={{ padding: "4px 10px", fontSize: ".8rem" }} onClick={() => setOnlineSearchOpen(false)}>✕ 关闭</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: "1px solid var(--border-glass)", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          {!batchMode && (
            <select value={activeSource} onChange={(e) => setActiveSource(e.target.value)} style={{ background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "7px 10px", fontSize: ".82rem", outline: "none", cursor: "pointer", maxWidth: 160 }}>
              {sources.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          )}
          {batchMode && (
            <span style={{ fontSize: ".78rem", color: "var(--accent)", padding: "7px 6px", whiteSpace: "nowrap" }}>
              ⚡ 批量搜索 ({sources.filter((s) => s.searchUrl).length} 个书源)
            </span>
          )}
          <input ref={inputRef} type="text" placeholder="输入小说名称..." value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (batchMode ? doBatchSearch() : doSearch())}
            style={{ flex: 1, minWidth: 120, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem", outline: "none" }} />
          <button className="btn btn-primary" onClick={batchMode ? doBatchSearch : doSearch} disabled={searching || !keyword.trim()} style={{ fontSize: ".82rem", padding: "7px 14px" }}>
            {searching ? "搜索中..." : "🔍 搜索"}
          </button>
          <button className="btn" onClick={() => { setBatchMode(!batchMode); setResults([]); setError(""); }}
            style={{ fontSize: ".78rem", padding: "7px 10px", background: batchMode ? "rgba(var(--accent-rgb),0.1)" : undefined, borderColor: batchMode ? "var(--accent)" : undefined }}>
            {batchMode ? "单源模式" : "批量模式"}
          </button>
          <button className="btn" onClick={() => setShowManager(!showManager)} style={{ fontSize: ".78rem", padding: "7px 10px" }}>
            ⚙️
          </button>
        </div>
        {showManager && (
          <div style={{ borderBottom: "1px solid var(--border-glass)", padding: "10px 20px", flexShrink: 0, maxHeight: "40%", overflow: "auto" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: ".74rem", color: "var(--text-dim)", minWidth: 50 }}>API:</span>
              <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://...json" style={{ flex: 1, minWidth: 150, background: "var(--glass-bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 6, padding: "5px 10px", fontSize: ".74rem", outline: "none" }} />
              <button className="btn btn-primary" onClick={importFromApi} disabled={importing || !importUrl.trim()} style={{ fontSize: ".72rem", padding: "5px 12px" }}>{importing ? "..." : "导入"}</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: ".78rem", fontWeight: 600, color: "var(--text)" }}>书源 ({sources.length})</span>
              <button className="btn" style={{ padding: "2px 8px", fontSize: ".7rem" }} onClick={() => openEdit()}>+ 新增</button>
            </div>
            {editingSource && (
              <div style={{ background: "var(--glass-bg)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, border: "1px solid var(--border-glass)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontSize: ".7rem" }}>
                  {(["name", "searchUrl", "listRule", "titleRule", "authorRule", "linkRule", "chapterListRule", "chapterTitleRule", "contentRule"] as const).map((field) => (
                    <div key={field} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ color: "var(--text-dim)", fontSize: ".62rem" }}>{field}</span>
                      <input value={(editingSource as any)[field]} onChange={(e) => setEditingSource({ ...editingSource, [field]: e.target.value })} style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-glass)", borderRadius: 4, padding: "2px 6px", fontSize: ".68rem", outline: "none", width: "100%" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button className="btn btn-primary" style={{ padding: "2px 10px", fontSize: ".7rem" }} onClick={saveEdit}>保存</button>
                  <button className="btn" style={{ padding: "2px 8px", fontSize: ".7rem" }} onClick={() => setEditingSource(null)}>取消</button>
                </div>
              </div>
            )}
            <div style={{ maxHeight: 140, overflow: "auto" }}>
              {sources.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", fontSize: ".74rem", borderBottom: "1px solid var(--border-glass)" }}>
                  <span style={{ color: "var(--text)" }}>{s.name}</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    <button className="btn" style={{ padding: "1px 5px", fontSize: ".64rem" }} onClick={() => openEdit(s)}>编辑</button>
                    {s.id !== "biquge" && <button className="btn" style={{ padding: "1px 5px", fontSize: ".64rem", color: "#e06060" }} onClick={() => deleteSource(s.id)}>删除</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {error && <div style={{ padding: "10px 24px", color: "#e06060", fontSize: ".78rem" }}>{error}</div>}
          {results.length === 0 && !searching && !error && (
            <div style={{ color: "var(--text-dim)", opacity: 0.35, textAlign: "center", paddingTop: 60, fontSize: ".85rem" }}>输入书名开始搜索</div>
          )}
          {results.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", borderBottom: "1px solid var(--border-glass)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--accent-rgb),0.03)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--text)", fontSize: ".9rem", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                <div style={{ color: "var(--text-dim)", fontSize: ".72rem" }}>{item.author || "未知作者"} · {item.source}</div>
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
