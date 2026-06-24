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
  const debounceRef = useRef<number>(0);
  const hasSearched = useRef(false);

  const filtered = chapters?.filter((ch, i) => {
    if (!chapterSearch) return true;
    return ch.title?.includes(chapterSearch) || `第${i + 1}章`.includes(chapterSearch);
  }) || [];

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
      try {
        const results = await invoke('search_text', {
          bookId,
          query: contentSearch.trim(),
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
  }, [contentSearch, bookId, searchTab]);

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
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {searchTab === '章节' ? (
          /* ── 章节列表 ── */
          filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '.8rem' }}>未找到匹配章节</div>
          ) : (
            filtered.map((ch, fi) => {
              const realIdx = chapters?.indexOf(ch) ?? fi;
              return (
                <div key={realIdx}
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
