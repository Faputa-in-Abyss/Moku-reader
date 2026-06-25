import React from 'react';

interface PageRendererProps {
  text: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: number;
  textColor: string;
}

/**
 * 纯渲染组件 — 将文本按 \n 分割为段落，每个段落 <p> 首行缩进 2em
 */
export default function PageRenderer({
  text,
  fontSize,
  lineHeight,
  fontFamily,
  fontWeight,
  textColor,
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
        transition: 'color 0.3s ease',
      }}
    >
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            textIndent: '2em',
            margin: 0,
          }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}
