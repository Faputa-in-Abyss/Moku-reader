import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookmarkIcon } from './FlatIcons';

interface ChapterListProps {
  chapters: Array<{ title: string }>;
  currentChapter: number;
  bookmarks: Array<{ chapterIndex: number; chapterTitle: string }>;
  open: boolean;
  onSelect: (idx: number, charOffset?: number) => void;
  onClose: () => void;
  onRemoveBookmark: (chapterIndex: number) => void;
  bookId?: string;
}

interface SearchSnippet {
  chapter_index: number;
  chapter_title: string;
  abs_start: number;
  abs_end: number;
  chapter_char_offset: number;
  snippet: string;
}

export default function ChapterList({
  chapters, currentChapter, bookmarks, open, onSelect, onClose, onRemoveBookmark, bookId,
}: ChapterListProps) {
  const [chapterSearch, setChapterSearch] = useState('');
  const [contentSearch, setContentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSnippet[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTab, setSearchTab] = useState<'章节' | '正文'>('章节');
  const [tabSliderStyle, setTabSliderStyle] = useState<React.CSSProperties>({});
  const [rangeOpen, setRangeOpen] = useState(true);
  const [rangeStart, setRangeStart] = useState<number | null>(1);
  const [rangeEnd, setRangeEnd] = useState<number | null>(chapters?.length || null);
  const debounceRef = useRef<number>(0);
  const hasSearched = useRef(false);

  const totalChapters = chapters?.length || 1;

  // 章节数变化时同步范围默认值
  useEffect(() => {
    if (searchTab === '正文') {
      setRangeStart(null);
      setRangeEnd(null);
    }
  }, [totalChapters]);

  const filtered = chapters?.filter((ch, i) => {
    if (!chapterSearch) return true;
    return ch.title?.includes(chapterSearch) || `第${i + 1}章`.includes(chapterSearch);
  }) || [];

  const listRef = useRef<HTMLDivElement>(null);

  // 侧栏打开时自动滚动到当前章节
  useEffect(() => {
    if (!open || searchTab !== '章节') return;
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      const activeEl = el.querySelector('[data-current="true"]') as HTMLElement | null;
      if (activeEl) {
        // 当前章节定位到容器上方约 0.5 个章节高度处
        el.scrollTop = activeEl.offsetTop - el.clientHeight * 0.25 - activeEl.offsetHeight * 2;
      }
    });
  }, [open, searchTab, chapterSearch]);

  const tabNames = ['章节', '正文'] as const;

  useEffect(() => {
    const el = document.getElementById('ch-tabs');
    if (!el) return;
    const activeEl = el.querySelector(`[data-tab="${searchTab}"]`) as HTMLElement | null;
    if (!activeEl) return;
    const parent = el.getBoundingClientRect();
    const rect = activeEl.getBoundingClientRect();
    setTabSliderStyle({ left: rect.left - parent.left, width: rect.width });
  }, [searchTab]);

  // 清除搜索状态
  useEffect(() => {
    if (searchTab !== '正文') {
      setContentSearch('');
      setSearchResults([]);
      hasSearched.current = false;
    } else {
      // 切到正文 tab 时展开范围面板
      setRangeOpen(true);
    }
  }, [searchTab]);

  // 防抖搜索
  useEffect(() => {
    if (searchTab !== '正文' || !contentSearch.trim() || !bookId) {
      return;
    }
    clearTimeout(debounceRef.current);
    setSearching(true);
    hasSearched.current = true;

    debounceRef.current = window.setTimeout(async () => {
      const startIdx = rangeStart != null ? Math.max(0, rangeStart - 1) : 0;
      const endIdx = rangeEnd != null ? Math.min(totalChapters - 1, rangeEnd - 1) : totalChapters - 1;
      try {
        const results = await invoke('search_text', {
          bookId,
          query: contentSearch.trim(),
          chapterStart: startIdx,
          chapterEnd: endIdx,
        }) as SearchSnippet[];
        setSearchResults(results);
      } catch (e) {
        console.error('搜索失败:', e);
        // 可能是缓存未加载，尝试先打开缓存再搜
        try {
          await invoke('open_book_cache', { bookId });
          const results = await invoke('search_text', {
            bookId,
            query: contentSearch.trim(),
            chapterStart: startIdx,
            chapterEnd: endIdx,
          }) as SearchSnippet[];
          setSearchResults(results);
        } catch (e2) {
          console.error('重试搜索仍失败:', e2);
        }
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [contentSearch, bookId, searchTab, rangeStart, rangeEnd, totalChapters]);

  const handleSelect = useCallback((idx: number, charOffset?: number) => {
    onSelect(idx, charOffset);
    onClose();
  }, [onSelect, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 280,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        borderRight: '1px solid var(--border-glass)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.35s ease',
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>目录</span>
        <button className="btn" style={{ padding: '2px 8px', fontSize: '.7rem' }} onClick={onClose}>✕</button>
      </div>

      {/* 滑动 Tab */}
      <div style={{ padding: '8px 16px 0' }}>
        <div id="ch-tabs" style={{
          display: 'flex', gap: 0, cursor: 'pointer', userSelect: 'none',
          background: 'rgba(var(--accent-rgb),0.06)',
          borderRadius: 'var(--radius-md)', padding: 3,
          position: 'relative', overflow: 'visible',
        }}>
          <div style={{
            position: 'absolute', top: 3, bottom: 3,
            background: 'rgba(var(--accent-rgb),0.18)',
            borderRadius: 'var(--radius-md)',
            willChange: 'left, width',
            transition: 'left 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), width 0.4s cubic-bezier(0.22, 0.61, 0.36, 1)',
            zIndex: 0, ...tabSliderStyle,
          }} />
          {tabNames.map((tab) => (
            <span key={tab} data-tab={tab}
              onClick={() => { if (tab === searchTab) return; setSearchTab(tab); }}
              style={{
                flex: 1, textAlign: 'center',
                fontSize: '.78rem', padding: '5px 14px', position: 'relative', zIndex: 1,
                fontWeight: searchTab === tab ? 600 : 400,
                color: searchTab === tab ? 'var(--text)' : 'var(--text-dim)',
                transition: 'color 0.3s ease',
                whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      {/* 搜索输入框 */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-glass)' }}>
        {searchTab === '章节' ? (
          <input
            placeholder="搜索章节..."
            value={chapterSearch}
            onChange={(e) => setChapterSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') { setChapterSearch(''); (e.target as HTMLInputElement).blur(); } }}
            style={{
              width: '100%', padding: '6px 10px', fontSize: '.8rem',
              background: 'var(--glass-bg)', color: 'var(--text)',
              border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        ) : (
          <>
          <input
            placeholder="搜索正文内容..."
            value={contentSearch}
            onChange={(e) => setContentSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') { setContentSearch(''); (e.target as HTMLInputElement).blur(); } }}
            style={{
              width: '100%', padding: '6px 10px', fontSize: '.8rem',
              background: 'var(--glass-bg)', color: 'var(--text)',
              border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {/* 范围折叠面板 */}
          <div style={{ marginTop: 6 }}>
            <div onClick={() => setRangeOpen(!rangeOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', padding: '3px 4px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '.9rem', color: 'var(--accent)', lineHeight: 1, display: 'flex' }}>
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" style={{
                  transform: rangeOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}>
                  <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>范围</span>
              {!rangeOpen && (
                <span style={{ fontSize: '.78rem', color: 'var(--accent)', marginLeft: 2 }}>
                  {(rangeStart == null || rangeStart === 1) && rangeEnd == null ? '全书' : `第${rangeStart ?? 1}—${rangeEnd ?? totalChapters}章`}
                </span>
              )}
            </div>
            {rangeOpen && (
              <div style={{ paddingLeft: 22, display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
                <span style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>第</span>
                <input type="number" min={1} max={totalChapters}
                  value={rangeStart ?? ''}
                  placeholder="不限"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') { setRangeStart(null); return; }
                    const v = Math.max(1, Math.min(totalChapters, Number(raw) || 1));
                    setRangeStart(rangeEnd != null ? Math.min(v, rangeEnd) : v);
                  }}
                  style={{
                    width: 52, padding: '3px 0', fontSize: '.82rem', textAlign: 'center',
                    background: 'var(--glass-bg)', color: 'var(--text)',
                    border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>—</span>
                <input type="number" min={1} max={totalChapters}
                  value={rangeEnd ?? ''}
                  placeholder="不限"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') { setRangeEnd(null); return; }
                    const v = Math.max(1, Math.min(totalChapters, Number(raw) || 1));
                    setRangeEnd(rangeStart != null ? Math.max(v, rangeStart) : v);
                  }}
                  style={{
                    width: 52, padding: '3px 0', fontSize: '.82rem', textAlign: 'center',
                    background: 'var(--glass-bg)', color: 'var(--text)',
                    border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>章</span>
                <button className="btn" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '.78rem', lineHeight: '20px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.1)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; }}
                  onClick={(e) => { e.stopPropagation(); setRangeStart(currentChapter + 1); setRangeEnd(currentChapter + 1); }}>
                  当前章
                </button>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {/* 书签（仅章节 tab） */}
      {searchTab === '章节' && bookmarks.length > 0 && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--accent)', marginBottom: 4 }}>
            <BookmarkIcon size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />书签
          </div>
          {bookmarks.map((bm) => (
            <div key={bm.chapterIndex} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span onClick={() => handleSelect(bm.chapterIndex)}
                style={{ fontSize: '.8rem', color: 'var(--text)', cursor: 'pointer', flex: 1 }}>
                {bm.chapterTitle}
              </span>
              <span onClick={() => onRemoveBookmark(bm.chapterIndex)}
                style={{ fontSize: '.7rem', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px 6px' }}>✕</span>
            </div>
          ))}
        </div>
      )}

      {/* 内容区域 */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {searchTab === '章节' ? (
          /* ── 章节列表 ── */
          filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '.8rem' }}>未找到匹配章节</div>
          ) : (
            filtered.map((ch, fi) => {
              const realIdx = chapters?.indexOf(ch) ?? fi;
              return (
                <div key={realIdx}
                  data-current={realIdx === currentChapter ? 'true' : undefined}
                  onClick={() => handleSelect(realIdx)}
                  style={{
                    padding: '10px 20px', cursor: 'pointer', fontSize: '.85rem',
                    color: realIdx === currentChapter ? 'var(--accent)' : 'var(--text)',
                    background: realIdx === currentChapter ? 'rgba(var(--accent-rgb),0.15)' : 'transparent',
                    borderLeft: realIdx === currentChapter ? '3px solid var(--accent)' : '3px solid transparent',
                    border: realIdx === currentChapter ? '1px solid rgba(var(--accent-rgb),0.2)' : '1px solid transparent',
                    boxShadow: realIdx === currentChapter ? '0 0 14px rgba(var(--accent-rgb),0.12), inset 0 0 6px rgba(var(--accent-rgb),0.04)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = realIdx === currentChapter ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(var(--accent-rgb),0.08)';
                    e.currentTarget.style.boxShadow = '0 0 18px rgba(var(--accent-rgb),0.2), inset 0 0 8px rgba(var(--accent-rgb),0.05)';
                    e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.3)';
                    e.currentTarget.style.borderLeftColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = realIdx === currentChapter ? 'rgba(var(--accent-rgb),0.15)' : 'transparent';
                    e.currentTarget.style.boxShadow = realIdx === currentChapter ? '0 0 14px rgba(var(--accent-rgb),0.12), inset 0 0 6px rgba(var(--accent-rgb),0.04)' : 'none';
                    e.currentTarget.style.borderColor = realIdx === currentChapter ? 'rgba(var(--accent-rgb),0.2)' : 'transparent';
                    e.currentTarget.style.borderLeftColor = realIdx === currentChapter ? 'var(--accent)' : 'transparent';
                  }}
                >
                  {ch.title || `第${realIdx + 1}章`}
                  {bookmarks.find((b) => b.chapterIndex === realIdx) ? (
                    <BookmarkIcon size={12} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
                  ) : null}
                </div>
              );
            })
          )
        ) : (
          /* ── 正文搜索结果 ── */
          !contentSearch.trim() ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '.8rem' }}>
              输入关键词搜索正文内容
            </div>
          ) : searching ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '.8rem' }}>
              搜索中…
            </div>
          ) : searchResults.length === 0 ? (
            hasSearched.current ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '.8rem' }}>
                未找到「{contentSearch}」的匹配结果
              </div>
            ) : null
          ) : (
            <>
              <div style={{ padding: '4px 20px 6px', fontSize: '.7rem', color: 'var(--text-dim)', opacity: 0.6 }}>
                共 {searchResults.length} 个匹配
              </div>
              {searchResults.map((r, i) => (
                <div key={i}
                  onClick={() => handleSelect(r.chapter_index, r.chapter_char_offset)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(var(--accent-rgb),0.05)',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: '.78rem', color: 'var(--text)', lineHeight: 1.7, wordBreak: 'break-all' }}>
                    <HighlightSnippet text={r.snippet} />
                  </div>
                  <div style={{ fontSize: '.7rem', color: 'var(--accent)', marginTop: 4, opacity: 0.8 }}>
                    {r.chapter_title || `第${r.chapter_index + 1}章`}
                  </div>
                </div>
              ))}
            </>
          )
        )}
      </div>
    </div>
  );
}

/** 高亮搜索结果片段：{{keyword}} → <mark> */
function HighlightSnippet({ text }: { text: string }) {
  const parts = text.split(/(\{\{|\}\})/);
  const nodes: React.ReactNode[] = [];
  let highlight = false;
  for (const part of parts) {
    if (part === '{{') {
      highlight = true;
    } else if (part === '}}') {
      highlight = false;
    } else if (highlight) {
      nodes.push(
        <mark key={nodes.length} style={{
          background: 'rgba(var(--accent-rgb),0.3)',
          color: 'var(--accent)',
          borderRadius: 2,
          padding: '0 1px',
        }}>{part}</mark>
      );
    } else {
      nodes.push(<span key={nodes.length}>{part}</span>);
    }
  }
  return <>{nodes}</>;
}
