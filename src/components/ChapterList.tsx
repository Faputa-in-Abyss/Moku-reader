import React, { useState } from 'react';

interface ChapterListProps {
  chapters: Array<{ title: string }>;
  currentChapter: number;
  bookmarks: Array<{ chapterIndex: number; chapterTitle: string }>;
  open: boolean;
  onSelect: (idx: number) => void;
  onClose: () => void;
  onRemoveBookmark: (chapterIndex: number) => void;
}

/**
 * 章节目录侧栏组件
 * - 搜索过滤
 * - 书签列表
 * - 当前章节高亮
 * - 滚动条穿透阻止
 */
export default function ChapterList({
  chapters,
  currentChapter,
  bookmarks,
  open,
  onSelect,
  onClose,
  onRemoveBookmark,
}: ChapterListProps) {
  const [chapterSearch, setChapterSearch] = useState('');

  const filtered =
    chapters?.filter((ch, i) => {
      if (!chapterSearch) return true;
      return (
        ch.title?.includes(chapterSearch) ||
        `第${i + 1}章`.includes(chapterSearch)
      );
    }) || [];

  const renderChapterItem = (ch: { title: string }, realIdx: number) => (
    <div
      key={realIdx}
      onClick={() => {
        onSelect(realIdx);
        onClose();
      }}
      style={{
        padding: '10px 20px',
        cursor: 'pointer',
        fontSize: '.85rem',
        color: realIdx === currentChapter ? 'var(--accent)' : 'var(--text)',
        background:
          realIdx === currentChapter
            ? 'rgba(var(--accent-rgb),0.15)'
            : 'transparent',
        borderLeft:
          realIdx === currentChapter
            ? '3px solid var(--accent)'
            : '3px solid transparent',
        border:
          realIdx === currentChapter
            ? '1px solid rgba(var(--accent-rgb),0.2)'
            : '1px solid transparent',
        boxShadow:
          realIdx === currentChapter
            ? '0 0 14px rgba(var(--accent-rgb),0.12), inset 0 0 6px rgba(var(--accent-rgb),0.04)'
            : 'none',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        const t = e.currentTarget;
        t.style.background =
          realIdx === currentChapter
            ? 'rgba(var(--accent-rgb),0.2)'
            : 'rgba(var(--accent-rgb),0.08)';
        t.style.boxShadow =
          '0 0 18px rgba(var(--accent-rgb),0.2), inset 0 0 8px rgba(var(--accent-rgb),0.05)';
        t.style.borderColor = 'rgba(var(--accent-rgb),0.3)';
        t.style.borderLeftColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget;
        t.style.background =
          realIdx === currentChapter
            ? 'rgba(var(--accent-rgb),0.15)'
            : 'transparent';
        t.style.boxShadow =
          realIdx === currentChapter
            ? '0 0 14px rgba(var(--accent-rgb),0.12), inset 0 0 6px rgba(var(--accent-rgb),0.04)'
            : 'none';
        t.style.borderColor =
          realIdx === currentChapter
            ? 'rgba(var(--accent-rgb),0.2)'
            : 'transparent';
        t.style.borderLeftColor =
          realIdx === currentChapter ? 'var(--accent)' : 'transparent';
      }}
    >
      {ch.title || `第${realIdx + 1}章`}
      {bookmarks.find((b) => b.chapterIndex === realIdx) ? (
        <span style={{ marginLeft: 6, fontSize: '.75rem' }}>🔖</span>
      ) : null}
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 280,
        background: 'var(--glass-bg)',
        backdropFilter:
          'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
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
      {/* 顶部 bar */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>目录</span>
        <button
          className="btn"
          style={{ padding: '2px 8px', fontSize: '.7rem' }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* 搜索框 */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-glass)',
        }}
      >
        <input
          placeholder="搜索章节..."
          value={chapterSearch}
          onChange={(e) => setChapterSearch(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: '.8rem',
            background: 'var(--glass-bg)',
            color: 'var(--text)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-sm)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* 书签区域 */}
      {bookmarks.length > 0 && (
        <div
          style={{
            padding: '8px 20px',
            borderBottom: '1px solid var(--border-glass)',
          }}
        >
          <div
            style={{
              fontSize: '.75rem',
              color: 'var(--accent)',
              marginBottom: 4,
            }}
          >
            🔖 书签
          </div>
          {bookmarks.map((bm) => (
            <div
              key={bm.chapterIndex}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
              }}
            >
              <span
                onClick={() => {
                  onSelect(bm.chapterIndex);
                  onClose();
                }}
                style={{
                  fontSize: '.8rem',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                {bm.chapterTitle}
              </span>
              <span
                onClick={() => onRemoveBookmark(bm.chapterIndex)}
                style={{
                  fontSize: '.7rem',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 章节列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '.8rem',
            }}
          >
            未找到匹配章节
          </div>
        ) : (
          filtered.map((ch, fi) => {
            const realIdx = chapters?.indexOf(ch) ?? fi;
            return renderChapterItem(ch, realIdx);
          })
        )}
      </div>
    </div>
  );
}
