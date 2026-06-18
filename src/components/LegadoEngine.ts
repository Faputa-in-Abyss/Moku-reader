/**
 * Legado 书源 CSS 选择器解析引擎
 *
 * @ 的两种含义：
 *   - 在 CSS 中间：后代选择器（如 .chapters@li@a → .chapters li a）
 *   - 在末尾带属性关键词：属性提取（如 class.s2@text → CSS .s2，取 text）
 *
 * 属性关键词：text, html, href, src, textNodes
 * 索引语法：!N（如 li!0 取第一个 li），或独立 .N
 * 拼接：&&
 * 替换：##regex|replacement
 */

const ATTR_KEYWORDS = ['text', 'html', 'href', 'src', 'textNodes'];

export interface LegadoRule {
  bookList?: string;
  name?: string;
  author?: string;
  bookUrl?: string;
  coverUrl?: string;
  intro?: string;
  kind?: string;
  wordCount?: string;
  lastChapter?: string;
  chapterList?: string;
  chapterName?: string;
  chapterUrl?: string;
  content?: string;
  replaceRegex?: string[] | string[][];
  nextContentUrl?: string;
}

export interface LegadoSource {
  bookSourceName: string;
  bookSourceUrl: string;
  bookSourceType?: number;
  enabled?: boolean;
  searchUrl: string;
  ruleSearch?: LegadoRule | string;
  ruleBookInfo?: LegadoRule | string;
  ruleToc?: LegadoRule | string;
  ruleContent?: LegadoRule | string;
  header?: string;
  // V3 扁平格式
  ruleSearchUrl?: string;
  ruleSearchList?: string;
  ruleSearchName?: string;
  ruleSearchAuthor?: string;
  ruleSearchKind?: string;
  ruleSearchCoverUrl?: string;
  ruleSearchNoteUrl?: string;
  ruleBookName?: string;
  ruleBookAuthor?: string;
  ruleCoverUrl?: string;
  ruleIntroduce?: string;
  ruleChapterUrl?: string;
  ruleChapterList?: string;
  ruleChapterName?: string;
  ruleBookContent?: string;
}

// ===== 核心解析 =====

/**
 * 从规则字符串中提取 CSS 选择器、索引和属性提取
 * 如 ".result@li" → { css: ".result li", index: null, attr: "text" }
 * 如 "class.s2@text" → { css: ".s2", index: null, attr: "text" }
 * 如 "li!0" → { css: "li", index: 0, attr: "text" }
 * 如 "tag.span.3@text" → { css: "span", index: 3, attr: "text" }
 */
function parseRule(rule: string): {
  css: string;
  index: number | null;
  attr: string;
  replacePattern: string | undefined;
} {
  let r = rule.trim();
  let replacePattern: string | undefined;

  // 1. 提取 ## 替换
  const hashIdx = r.indexOf('##');
  if (hashIdx >= 0) {
    replacePattern = r.slice(hashIdx + 2);
    r = r.slice(0, hashIdx).trim();
  }

  // 2. 检查末尾 @attr
  let attr = 'text';
  for (const kw of ATTR_KEYWORDS) {
    // 匹配 @keyword 在末尾
    const pattern = new RegExp(`@${kw}$`);
    if (pattern.test(r)) {
      attr = kw;
      r = r.slice(0, r.lastIndexOf('@')).trim();
      break;
    }
  }

  // 3. 剩余部分：替换 @ 为空格（后代选择器）
  r = r.replace(/@/g, ' ');

  // 4. 提取 !N 索引
  let index: number | null = null;
  const bangMatch = r.match(/!(\d+)$/);
  if (bangMatch) {
    index = parseInt(bangMatch[1], 10);
    r = r.slice(0, r.lastIndexOf('!')).trim();
  }

  // 5. 标准化 CSS 前缀
  r = normalizeCss(r);

  // 6. 检查是否有尾部 .N 作为索引（如果没有 !N 的话）
  if (index === null) {
    const dotNumMatch = r.match(/\.(\d+)$/);
    if (dotNumMatch) {
      // 但需要排除像 .classname 后面跟纯数字的情况
      // 检查数字前面是否真的是标签而不是 class
      const before = r.slice(0, r.lastIndexOf('.' + dotNumMatch[1]));
      // 如果数字前是标签名（没有 . 前缀）或者已经处理过了
      // 简单判断：如果数字前面的字符不是字母（说明是标签后的数字）
      if (before.length > 0 && /[a-z]>*$/i.test(before)) {
        index = parseInt(dotNumMatch[1], 10);
        r = r.slice(0, r.lastIndexOf('.' + dotNumMatch[1]));
      }
    }
  }

  return { css: r, index, attr, replacePattern };
}

function normalizeCss(sel: string): string {
  // 分段处理，每段单独转换，支持 "id.list dd" 这种多段
  return sel.split(/\s+/).map(s => {
    if (s.startsWith('class.')) return '.' + s.slice(6);
    if (s.startsWith('id.')) return '#' + s.slice(3);
    if (s.startsWith('tag.')) return s.slice(4);
    if (s.startsWith('text.')) return s.slice(5);
    return s;
  }).join(' ');
}

// ===== 提取值 =====

function extractAttr(el: Element, attr: string): string {
  switch (attr) {
    case 'text': return el.textContent?.trim() || '';
    case 'html': return el.innerHTML?.trim() || '';
    case 'href': return el.getAttribute('href')?.trim() || '';
    case 'src': return el.getAttribute('src')?.trim() || '';
    case 'textNodes':
      let text = '';
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent || '';
      }
      return text.trim();
    default: return el.getAttribute(attr)?.trim() || '';
  }
}

/** 在一个元素/文档上执行规则，返回提取的值 */
export function extractValue(
  el: Element | Document,
  rawRule: string,
  baseUrl?: string
): string {
  // 用 && 分隔多规则
  const parts = rawRule.split('&&').map(s => s.trim()).filter(Boolean);
  let results: string[] = [];

  for (const part of parts) {
    const { css, index, attr, replacePattern } = parseRule(part);
    if (!css) continue;

    let elements: Element[];
    try {
      elements = Array.from(el.querySelectorAll(css));
    } catch {
      continue;
    }

    if (index !== null && index < elements.length) {
      elements = [elements[index]];
    }

    let val = '';
    for (const elem of elements) {
      let v = extractAttr(elem, attr);
      if (!v) continue;
      if ((attr === 'href' || attr === 'src') && baseUrl && !v.startsWith('http')) {
        try { v = new URL(v, baseUrl).href; } catch {}
      }
      val += v;
    }

    if (replacePattern) {
      val = applyReplace(val, replacePattern);
    }

    if (val) results.push(val);
  }

  return results.join('');
}

/** 提取列表元素（如搜索结果列表、章节列表） */
export function extractList(
  el: Element | Document,
  rawRule: string
): Element[] {
  const { css, index } = parseRule(rawRule);
  if (!css) return [];

  let elements: Element[];
  try {
    elements = Array.from(el.querySelectorAll(css));
  } catch {
    return [];
  }

  if (index !== null && index < elements.length) {
    return [elements[index]];
  }

  return elements;
}

// ===== 替换 =====

function applyReplace(text: string, pattern: string): string {
  const pipeIdx = pattern.indexOf('|');
  if (pipeIdx >= 0) {
    try {
      return text.replace(new RegExp(pattern.slice(0, pipeIdx), 'g'), pattern.slice(pipeIdx + 1));
    } catch { return text; }
  } else {
    try {
      return text.replace(new RegExp(pattern, 'g'), '');
    } catch { return text; }
  }
}

export function applyReplaceRegex(text: string, rules: string[] | string[][] | undefined): string {
  if (!rules) return text;
  let result = text;
  for (const rule of rules) {
    if (typeof rule === 'string') {
      result = applyReplace(result, rule);
    } else if (Array.isArray(rule) && rule.length >= 2) {
      try { result = result.replace(new RegExp(rule[0], 'g'), rule[1]); } catch {}
    }
  }
  return result;
}

// ===== 搜索 URL 处理 =====

export interface ParsedSearchUrl {
  url: string;
  method: string;
  body: string | null;
  charset: string;
}

export function parseSearchUrl(raw: string, keyword: string, page: number): ParsedSearchUrl {
  let urlStr = raw;
  let method = 'GET';
  let body: string | null = null;
  let charset = 'UTF-8';

  const commaIdx = urlStr.indexOf(',{');
  if (commaIdx >= 0) {
    const jsonPart = urlStr.slice(commaIdx + 1);
    urlStr = urlStr.slice(0, commaIdx);
    try {
      const config = JSON.parse(jsonPart);
      method = config.method || 'GET';
      body = config.body || null;
      charset = config.charset || 'UTF-8';
    } catch {}
  }

  const finalUrl = urlStr
    .replace(/\{\{key\}\}|\{\{searchKey\}\}/g, encodeURIComponent(keyword))
    .replace(/\{\{page\}\}|\{\{searchPage\}\}/g, String(page));

  if (body) {
    body = body
      .replace(/\{\{key\}\}|\{\{searchKey\}\}/g, keyword)
      .replace(/\{\{page\}\}|\{\{searchPage\}\}/g, String(page));
  }

  return { url: finalUrl, method, body, charset };
}
