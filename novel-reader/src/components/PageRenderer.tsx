import React from 'react';

interface PageRendererProps {
  text: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: number;
  textColor: string;
  /** 段落缩进，如 "2em" */
  textIndent?: string;
  /** 对齐方式 */
  textAlign?: "left" | "center" | "justify";
  /** 字间距 px */
  letterSpacing?: number;
  /** 有书签的段落索引集合 */
  bookmarkParagraphIndices?: Set<number>;
  /** 段落偏移（分页模式下，全局段落索引 = paragraphOffset + 当前段索引） */
  paragraphOffset?: number;
}

/**
 * 纯渲染组件 — 将文本按 \n 分割为段落，每个段落 <p> 首行缩进 2em
 * 书签段落：底部 1px accent 高亮线 + 右侧实心书签 SVG 图标
 */
export default function PageRenderer({
  text,
  fontSize,
  lineHeight,
  fontFamily,
  fontWeight,
  textColor,
  textIndent = '2em',
  textAlign = 'justify',
  letterSpacing = 0,
  bookmarkParagraphIndices,
  paragraphOffset = 0,
}: PageRendererProps) {
  const paragraphs = text
    .split('\n')
    .filter((l) => l.trim());

  return (
    <div
      style={{
        fontSize: `${fontSize}rem`,
        lineHeight,
        fontFamily,
        fontWeight,
        color: textColor || 'var(--text)',
        textAlign,
        letterSpacing: letterSpacing > 0 ? `${letterSpacing}px` : undefined,
        transition: 'color 0.3s ease',
      }}
    >
      {paragraphs.map((p, i) => {
        const globalIdx = paragraphOffset + i;
        const hasBookmark = bookmarkParagraphIndices?.has(globalIdx);
        return (
          <p
            key={i}
            data-paragraph-index={globalIdx}
            style={{
              textIndent,
              margin: 0,
              position: 'relative',
            }}
          >
            {p}
            {hasBookmark && (
              <React.Fragment>
                {/* 底部高亮线 — 在书签左侧结束 */}
                <span style={{
                  position: 'absolute',
                  bottom: 7,
                  left: 0,
                  right: 24,
                  height: 1,
                  background: 'var(--accent)',
                  opacity: 0.45,
                  pointerEvents: 'none',
                }} />
                {/* 右侧书签 — 顶部平直线与下划线对齐 */}
                <svg width={16} height={18} viewBox="0 0 16 20" fill="var(--accent)" style={{
                  position: 'absolute',
                  right: 18,
                  bottom: -9,
                  pointerEvents: 'none',
                  opacity: 1,
                }}>
                  <path d="M2 1h12a1 1 0 0 1 1 1v16l-7-5-7 5V2a1 1 0 0 1 1-1z" />
                </svg>
              </React.Fragment>
            )}
          </p>
        );
      })}
    </div>
  );
}
