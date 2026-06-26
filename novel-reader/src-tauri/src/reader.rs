use crate::parser::{read_txt_file, read_epub_file, read_html_file, parse_chapters, Chapter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{LazyLock, Mutex};

// ===== 全局缓存 =====

static BOOK_CACHE: LazyLock<Mutex<HashMap<String, CachedBook>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 分页缓存键：(book_id, chapter_idx, config_hash)
type PaginationCacheKey = (String, usize, u64);

static PAGINATION_CACHE: LazyLock<Mutex<HashMap<PaginationCacheKey, PaginationResult>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// ===== 数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedBook {
    pub book_id: String,
    pub full_text: String,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationConfig {
    pub font_size: f64,
    pub line_height: f64,
    pub container_width: u32,
    pub container_height: u32,
    pub double_page: bool,
}

impl Default for PaginationConfig {
    fn default() -> Self {
        Self {
            font_size: 1.0,
            line_height: 2.0,
            container_width: 800,
            container_height: 600,
            double_page: false,
        }
    }
}

impl Hash for PaginationConfig {
    fn hash<H: Hasher>(&self, state: &mut H) {
        // 转成整数哈希（避免浮点精度问题）
        let fs = (self.font_size * 100.0) as i64;
        let lh = (self.line_height * 100.0) as i64;
        fs.hash(state);
        lh.hash(state);
        self.container_width.hash(state);
        self.container_height.hash(state);
        self.double_page.hash(state);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageBreak {
    pub page_index: usize,
    pub start_char: usize,
    pub end_char: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationResult {
    pub pages: Vec<PageBreak>,
    pub total_pages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingPositionData {
    pub chapter_index: usize,
    pub char_offset: usize,
    pub page_index: usize,
    pub scroll_offset: f64,
}

// ===== 全文搜索数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSnippet {
    pub chapter_index: usize,
    pub chapter_title: String,
    /// 匹配文本在 full_text 中的绝对位置
    pub abs_start: usize,
    pub abs_end: usize,
    /// 在章节文本内的偏移（用于精确跳转）
    pub chapter_char_offset: usize,
    /// 上下文片段（关键词用 {{ }} 包围，前端替换为高亮标记）
    pub snippet: String,
}

// ===== 缓存管理 =====

pub fn load_book_cache(book_id: &str, file_path: &str, file_type: &str) -> Result<CachedBook, String> {
    // 读取全文
    let full_text = match file_type {
        "txt" => read_txt_file(file_path)?,
        "epub" => read_epub_file(file_path)?,
        "html" | "htm" => read_html_file(file_path)?,
        _ => return Err(format!("不支持的文件格式: {}", file_type)),
    };
    let full_text = full_text.replace("\r\n", "\n").replace('\r', "\n");

    // 解析章节
    let chapters = parse_chapters(&full_text);

    let book = CachedBook {
        book_id: book_id.to_string(),
        full_text,
        chapters,
    };

    // 写入全局缓存
    if let Ok(mut cache) = BOOK_CACHE.lock() {
        cache.insert(book_id.to_string(), book.clone());
    }

    println!("[reader] 加载缓存: book={}, 文本长度={}字节, 章节数={}",
        book_id, book.full_text.len(), book.chapters.len());

    Ok(book)
}

pub fn get_cached_book(book_id: &str) -> Option<CachedBook> {
    if let Ok(cache) = BOOK_CACHE.lock() {
        cache.get(book_id).cloned()
    } else {
        None
    }
}

pub fn drop_book_cache(book_id: &str) {
    if let Ok(mut cache) = BOOK_CACHE.lock() {
        cache.remove(book_id);
    }
    // 同时清理分页缓存
    if let Ok(mut pcache) = PAGINATION_CACHE.lock() {
        pcache.retain(|key, _| key.0 != book_id);
    }
    println!("[reader] 释放缓存: book={}", book_id);
}

// ===== 全文搜索 =====

/// 在已缓存的书籍全文搜索关键词，返回匹配片段列表（最多 200 条）
/// chapter_start/chapter_end: 可选章节范围（0-based，含两端），None 搜全书
pub fn search_in_book(
    book_id: &str,
    query: &str,
    chapter_start: Option<usize>,
    chapter_end: Option<usize>,
) -> Result<Vec<SearchSnippet>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let cached = get_cached_book(book_id)
        .ok_or_else(|| format!("书籍未加载到缓存: {}", book_id))?;

    let full_text = &cached.full_text;
    let query_lower = query.to_lowercase();
    let query_byte_len = query.len();
    let context_byte_approx: usize = 60; // 约 20 个中文字符
    let max_results: usize = 200;

    let chapter_count = cached.chapters.len();

    // 确定章节范围
    let range_start = chapter_start.unwrap_or(0).min(chapter_count.saturating_sub(1));
    let range_end = chapter_end.unwrap_or(chapter_count.saturating_sub(1)).min(chapter_count.saturating_sub(1));
    let range = if range_start <= range_end {
        range_start..=range_end
    } else {
        0..=chapter_count.saturating_sub(1)
    };

    let mut results: Vec<SearchSnippet> = Vec::new();

    for ch_idx in range {
        let ch = &cached.chapters[ch_idx];
        let ch_start = ch.start_pos.min(full_text.len());
        let ch_end = ch.end_pos.min(full_text.len());
        if ch_start >= ch_end {
            continue;
        }
        let chapter_text = &full_text[ch_start..ch_end];
        let chapter_text_lower = chapter_text.to_lowercase();

        // 预构建字符边界字节索引列表，用于安全切片
        let boundaries: Vec<usize> = chapter_text.char_indices().map(|(i, _)| i).collect();

        let mut search_byte_from = 0usize;
        loop {
            if results.len() >= max_results {
                break;
            }
            let rel_byte = match chapter_text_lower[search_byte_from..].find(&query_lower) {
                Some(p) => search_byte_from + p,
                None => break,
            };

            // 安全计算上下文 start：找 <= target 的最近字符边界
            let ctx_start = {
                let target = rel_byte.saturating_sub(context_byte_approx);
                match boundaries.binary_search(&target) {
                    Ok(i) | Err(i) if i > 0 => boundaries[i - 1],
                    _ => 0,
                }
            };

            // 安全计算上下文 end：找 >= target 的最近字符边界
            let ctx_end = {
                let target = (rel_byte + query_byte_len + context_byte_approx).min(chapter_text.len());
                if target >= chapter_text.len() {
                    chapter_text.len()
                } else {
                    match boundaries.binary_search(&target) {
                        Ok(i) => boundaries[i],
                        Err(i) if i < boundaries.len() => boundaries[i],
                        _ => chapter_text.len(),
                    }
                }
            };

            let mut snippet = String::new();
            if ctx_start > 0 {
                snippet.push('\u{2026}');
            }
            snippet.push_str(&chapter_text[ctx_start..rel_byte]);
            snippet.push_str("{{");
            let kw_end = (rel_byte + query_byte_len).min(chapter_text.len());
            snippet.push_str(&chapter_text[rel_byte..kw_end]);
            snippet.push_str("}}");
            snippet.push_str(&chapter_text[kw_end..ctx_end]);
            if ctx_end < chapter_text.len() {
                snippet.push('\u{2026}');
            }

            results.push(SearchSnippet {
                chapter_index: ch.index,
                chapter_title: ch.title.clone(),
                abs_start: ch_start + rel_byte,
                abs_end: ch_start + rel_byte + query_byte_len,
                chapter_char_offset: rel_byte,
                snippet,
            });

            search_byte_from = rel_byte + query_byte_len;
        }

        if results.len() >= max_results {
            break;
        }
    }

    Ok(results)
}

pub fn get_chapter_text_from_cache(book_id: &str, chapter_idx: usize) -> Result<(String, String), String> {
    let cached = get_cached_book(book_id)
        .ok_or_else(|| format!("书籍未加载到缓存: {}", book_id))?;

    let chapter = cached.chapters.get(chapter_idx)
        .ok_or_else(|| format!("章节索引超出范围: {}", chapter_idx))?;

    let start = chapter.start_pos.min(cached.full_text.len());
    let end = chapter.end_pos.min(cached.full_text.len());

    if start >= end {
        return Ok((chapter.title.clone(), String::new()));
    }

    let text = cached.full_text[start..end].to_string();
    Ok((chapter.title.clone(), text))
}

// ===== 分页算法 =====

/// 顶部/底部 padding（导航栏 + 内容 padding）
const VERTICAL_PADDING: u32 = 120;

/// 首行缩进字符数
const FIRST_LINE_INDENT: u32 = 2;

/// 对章节文本进行分页计算
pub fn paginate_chapter(
    full_text: &str,
    chapter_start: usize,
    chapter_end: usize,
    config: PaginationConfig,
) -> PaginationResult {
    // 提取章节文本
    let start = chapter_start.min(full_text.len());
    let end = chapter_end.min(full_text.len());
    if start >= end {
        return PaginationResult {
            pages: Vec::new(),
            total_pages: 0,
        };
    }
    let text = &full_text[start..end];

    // 垂直可用空间
    let avail_height = (config.container_height.saturating_sub(VERTICAL_PADDING)) as f64;

    // 每行字符数 (cpl = chars per line)
    let font_size_px = config.font_size * 14.0; // 14px base
    let cpl = (config.container_width as f64 / (font_size_px * 1.02)).floor() as usize;
    let cpl = cpl.max(1); // 至少 1 个字符

    // 每页最大行数
    let line_height_px = font_size_px * config.line_height;
    let max_lines_per_page = (avail_height / line_height_px).floor() as usize;
    let max_lines_per_page = max_lines_per_page.max(1);

    // 如果是双页模式，可用宽度加倍
    let effective_cpl = if config.double_page {
        cpl * 2
    } else {
        cpl
    };

    // 按段落分页
    let mut pages: Vec<PageBreak> = Vec::new();
    let mut current_page_start = 0usize;
    let mut current_page_lines = 0usize;

    // 按 \n 分割段落
    let paragraphs: Vec<&str> = text.split('\n').collect();
    let mut char_offset = 0usize; // 相对于 text 开头的字符偏移

    for para in &paragraphs {
        let para_len = para.chars().count();
        let is_empty = para.trim().is_empty();

        // 空段落算一个空行
        if is_empty {
            // 检查是否需要新页
            if current_page_lines >= max_lines_per_page {
                // 把当前字符偏移作为分页点（不包括当前空行）
                let page_char_start = current_page_start;
                let page_char_end = char_offset;
                pages.push(PageBreak {
                    page_index: pages.len(),
                    start_char: page_char_start,
                    end_char: page_char_end,
                });
                current_page_start = char_offset;
                current_page_lines = 0;
            }
            current_page_lines += 1;
            char_offset += 1; // 换行符
            continue;
        }

        if para_len == 0 {
            char_offset += 1;
            continue;
        }

        // 计算本段落需要的行数
        // 第一行首行缩进 -2
        // 段落剩余字符继续
        let first_line_cpl = effective_cpl.saturating_sub(FIRST_LINE_INDENT as usize);
        let first_line_cpl = first_line_cpl.max(1);

        let mut remaining = para_len;
        let mut para_lines = 0usize;

        // 第一行
        if remaining > first_line_cpl {
            para_lines += 1;
            remaining -= first_line_cpl;
        } else {
            para_lines = 1;
            remaining = 0;
        }

        // 后续行
        if remaining > 0 {
            para_lines += (remaining + effective_cpl - 1) / effective_cpl;
        }

        // 检查是否需要跨页
        let mut remaining_lines = para_lines;
        let mut para_offset = 0usize;

        while remaining_lines > 0 {
            let available = max_lines_per_page.saturating_sub(current_page_lines);

            if available == 0 {
                // 当前页已满，新建一页
                let page_char_end = char_offset + para_offset;
                pages.push(PageBreak {
                    page_index: pages.len(),
                    start_char: current_page_start,
                    end_char: page_char_end,
                });
                current_page_start = char_offset + para_offset;
                current_page_lines = 0;
                continue;
            }

            // 本页能容纳的行数
            let take_lines = available.min(remaining_lines);

            if take_lines >= remaining_lines {
                // 整段都在本页
                current_page_lines += remaining_lines;
                para_offset += para_len.saturating_sub(para_offset);
                remaining_lines = 0;
            } else {
                // 需要跨页：计算这一页能放下多少字符
                let mut lines_taken = 0usize;

                // 第一行（缩进）
                let flc = if para_offset == 0 {
                    first_line_cpl
                } else {
                    effective_cpl
                };

                if lines_taken < take_lines {
                    let chunk = (para_len - para_offset).min(flc);
                    para_offset += chunk;
                    lines_taken += 1;
                }

                // 后续行
                while lines_taken < take_lines && para_offset < para_len {
                    let chunk = (para_len - para_offset).min(effective_cpl);
                    para_offset += chunk;
                    lines_taken += 1;
                }

                current_page_lines += lines_taken;
                remaining_lines -= lines_taken;

                // 如果段落还没完，换页
                if remaining_lines > 0 {
                    pages.push(PageBreak {
                        page_index: pages.len(),
                        start_char: current_page_start,
                        end_char: char_offset + para_offset,
                    });
                    current_page_start = char_offset + para_offset;
                    current_page_lines = 0;
                }
            }
        }

        char_offset += para_len + 1; // 内容 + 换行符
    }

    // 最后一页 — 仅在确实有未封装的内容时才追加，防止空白页
    // 检查 current_page_start 之后是否还有非空白字符（排除尾部空行导致的多余页）
    // 用 chars().skip() 避免 UTF-8 字节切片越界
    let remaining_has_text = text.chars().skip(current_page_start).any(|c| !c.is_whitespace());
    if (current_page_lines > 0 && remaining_has_text) || pages.is_empty() {
        pages.push(PageBreak {
            page_index: pages.len(),
            start_char: current_page_start,
            end_char: if text.is_empty() { 0 } else { text.len() },
        });
    }

    // 修正最后一页的 end_char
    if let Some(last) = pages.last_mut() {
        last.end_char = text.len();
    }

    let total_pages = pages.len();

    PaginationResult { pages, total_pages }
}

/// 计算 PaginationConfig 的缓存哈希
fn hash_config(config: &PaginationConfig) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    let mut hasher = DefaultHasher::new();
    config.hash(&mut hasher);
    hasher.finish()
}

/// 获取分页结果（带缓存）
pub fn get_or_compute_pagination(
    book_id: &str,
    chapter_idx: usize,
    config: &PaginationConfig,
) -> Result<PaginationResult, String> {
    let config_hash = hash_config(config);
    let key: PaginationCacheKey = (book_id.to_string(), chapter_idx, config_hash);

    // 检查缓存
    if let Ok(pcache) = PAGINATION_CACHE.lock() {
        if let Some(result) = pcache.get(&key) {
            return Ok(result.clone());
        }
    }

    // 获取缓存书
    let cached = get_cached_book(book_id)
        .ok_or_else(|| format!("书籍未加载到缓存: {}", book_id))?;

    let chapter = cached.chapters.get(chapter_idx)
        .ok_or_else(|| format!("章节索引超出范围: {}", chapter_idx))?;

    // 计算分页
    let result = paginate_chapter(&cached.full_text, chapter.start_pos, chapter.end_pos, config.clone());

    // 写入缓存
    if let Ok(mut pcache) = PAGINATION_CACHE.lock() {
        pcache.insert(key, result.clone());
    }

    Ok(result)
}
