import { useState, useEffect, useRef } from 'react';

/**
 * DOM 测量分页 hook
 *
 * 用一个隐藏的测量容器，把章节所有段落按渲染样式填入，读取每段 offsetHeight，
 * 再按"页内容高度"贪心切分成若干页。每页用段落索引数组表示。
 *
 * 翻页 = 切换 pageIndex，renderContent 只渲染当前页对应的段落子集，
 * 因此翻页是纯 setState，无 scrollLeft 偏移、无裁切。
 *
 * 依赖变化（文本/页宽/页高/字号/行高/字体/字重）会自动重新分页。
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface PaginationParams {
  /** 章节全文（段落以 \n 分隔） */
  text: string;
  /** 单页内容区宽度（不含 padding），单位 px */
  pageWidth: number;
  /** 单页内容区高度（不含 padding），单位 px */
  pageHeight: number;
  /** 字号 rem */
  fontSize: number;
  /** 行高（数字） */
  lineHeight: number;
  /** 字体族 */
  fontFamily: string;
  /** 字重 */
  fontWeight: number;
  /** 是否启用分页（仅翻页模式为 true） */
  enabled: boolean;
}

export function usePagination(params: PaginationParams) {
  const { text, pageWidth, pageHeight, fontSize, lineHeight, fontFamily, fontWeight, enabled } = params;
  /** pages[i] = 第 i 页包含的段落索引数组（章节级索引） */
  const [pages, setPages] = useState<number[][]>([]);
  /** 章节段落总数 */
  const [paragraphCount, setParagraphCount] = useState(0);
  /** 测量容器 ref，需由调用方挂到一个隐藏 div 上 */
  const measureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !text || pageWidth <= 0 || pageHeight <= 0) {
      setPages([]);
      setParagraphCount(0);
      return;
    }
    const paras = text.split('\n').filter((l) => l.trim());
    setParagraphCount(paras.length);
    if (paras.length === 0) {
      setPages([]);
      return;
    }

    const host = measureRef.current;
    if (!host) return;

    // 测量容器样式与 PageRenderer 保持一致：外层字体样式 + 内层 <p> textIndent 2em margin 0
    host.style.width = pageWidth + 'px';
    host.style.fontSize = fontSize + 'rem';
    host.style.lineHeight = String(lineHeight);
    host.style.fontFamily = fontFamily;
    host.style.fontWeight = String(fontWeight);

    // 一次性填入所有段落，只触发一次 reflow
    host.innerHTML = paras
      .map((p, i) => `<p data-i="${i}" style="margin:0;text-indent:2em;white-space:pre-wrap;word-break:break-word">${escapeHtml(p)}</p>`)
      .join('');

    const pEls = host.querySelectorAll('p');
    const heights: number[] = [];
    pEls.forEach((el) => heights.push((el as HTMLElement).offsetHeight));
    // 清空，避免长期持有大量 DOM
    host.innerHTML = '';

    // 贪心切分：累计高度超过页高则断页
    const result: number[][] = [];
    let cur: number[] = [];
    let acc = 0;
    for (let i = 0; i < paras.length; i++) {
      const h = heights[i] || 0;
      if (cur.length === 0 && h > pageHeight) {
        // 单段本身就超出一页：独占一页（少见，保留整段不硬切）
        result.push([i]);
        cur = [];
        acc = 0;
        continue;
      }
      if (cur.length > 0 && acc + h > pageHeight) {
        result.push(cur);
        cur = [i];
        acc = h;
      } else {
        cur.push(i);
        acc += h;
      }
    }
    if (cur.length > 0) result.push(cur);

    setPages(result);
  }, [text, pageWidth, pageHeight, fontSize, lineHeight, fontFamily, fontWeight, enabled]);

  return { pages, paragraphCount, measureRef };
}
