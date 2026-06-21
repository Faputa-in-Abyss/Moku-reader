/// 章节解析和文件读取模块
///
/// 章节识别：基于 Legado 规则系统简化版，匹配主流小说格式
/// 编码检测：UTF-8 / UTF-16 (LE/BE) / GBK / BIG5
///
/// 设计原则：
/// - 宁可多识别（少量误标）也不漏识别
/// - 不依赖字节偏移切片读取，后端直接返回完整文本，前端负责显示

use regex::Regex;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chapter {
    pub index: usize,
    pub title: String,
    pub start_pos: usize,
    pub end_pos: usize,
}

/// 编译一次，全局使用
struct ChapterRules {
    r1: Regex,   // 第X章/节/卷/回/篇/部/集
    r2: Regex,   // 纯数字开头
    r3: Regex,   // 括号包裹章节号
    r4: Regex,   // 装饰符号开头
    r5: Regex,   // 英文章节
    r6: Regex,   // 正文开头
}

impl ChapterRules {
    fn new() -> Self {
        Self {
            r1: Regex::new(r"^第\s*[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[章节卷回篇部集]").unwrap(),
            r2: Regex::new(r"^[\d]+[\.．、\-\s]").unwrap(),
            r3: Regex::new(r"^[\[（(【][\d零一二三四五六七八九十百千万]+[\]）)】]").unwrap(),
            r4: Regex::new(r"^[☆★✦✧✿❀⚘◇◆■□▲△▽▼○●]").unwrap(),
            r5: Regex::new(r"^(?:CHAPTER|VOLUME|SECTION|CH|VOL|SEC|ACT|PART|BOOK|STAGE|SCENE)\s*[\dIVXLivxl\-]+").unwrap(),
            r6: Regex::new(r"^正文").unwrap(),
        }
    }
}

/// 行级章节检测
fn is_chapter_line(t: &str, rules: &ChapterRules) -> bool {
    if t.is_empty() || t.chars().count() > 100 {
        return false;
    }
    if t.contains("本章完") || t.contains("本章结") || t == "正文完" || t == "正文结" {
        return false;
    }

    // 独立关键词精确匹配
    let standalone = [
        "序章", "楔子", "终章", "后记", "尾声", "番外",
        "内容简介", "文案", "前言", "引子",
    ];
    for kw in &standalone {
        if t == *kw || t.starts_with(kw) {
            return true;
        }
    }

    rules.r1.is_match(t)
        || rules.r2.is_match(t)
        || rules.r3.is_match(t)
        || rules.r4.is_match(t)
        || rules.r5.is_match(t)
        || rules.r6.is_match(t)
}

/// 解析小说文本，返回章节列表
/// 始终返回至少 1 个章节（未识别时整本作为"正文"一章）
pub fn parse_chapters(text: &str) -> Vec<Chapter> {
    let lines: Vec<&str> = text.lines().collect();
    let total_len = text.len();

    // 计算每行字节偏移
    let line_offsets: Vec<usize> = {
        let mut offsets = Vec::with_capacity(lines.len() + 1);
        let mut pos = 0;
        for line in &lines {
            offsets.push(pos);
            // line.len() 对 \r\n 文件包含 \r（lines()保留\r），+1跳\n，精确跳过 \r\n
            pos += line.len() + 1;
        }
        offsets.push(pos.min(total_len));
        offsets
    };

    let rules = ChapterRules::new();

    let mut chapters: Vec<Chapter> = Vec::new();
    let mut current_start = 0usize;
    let mut current_title = String::new();
    let mut has_any = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if is_chapter_line(trimmed, &rules) {
            has_any = true;
            if !current_title.is_empty() {
                chapters.push(Chapter {
                    index: chapters.len(),
                    title: current_title.clone(),
                    start_pos: current_start,
                    end_pos: line_offsets[i],
                });
            }
            current_start = line_offsets[i];
            current_title = trimmed.to_string();
        }
    }

    // 最后一章 / 无章节时统一收尾
    if has_any {
        if total_len > current_start {
            chapters.push(Chapter {
                index: chapters.len(),
                title: current_title,
                start_pos: current_start,
                end_pos: total_len,
            });
        }
    } else {
        chapters.push(Chapter {
            index: 0,
            title: "正文".to_string(),
            start_pos: 0,
            end_pos: total_len,
        });
    }

    chapters
}

/// 读取 TXT 文件，自动检测编码
pub fn read_txt_file(path: &str) -> Result<String, String> {
    let content = std::fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;
    if content.is_empty() {
        return Err("文件为空".to_string());
    }

    // BOM 检测
    if content.len() >= 3 && content[0] == 0xEF && content[1] == 0xBB && content[2] == 0xBF {
        if let Ok(text) = String::from_utf8(content[3..].to_vec()) {
            return Ok(text);
        }
    }
    if content.len() >= 2 && content[0] == 0xFF && content[1] == 0xFE {
        let u16_words: Vec<u16> = content[2..].chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return String::from_utf16(&u16_words).map_err(|e| format!("UTF-16LE解码失败: {}", e));
    }
    if content.len() >= 2 && content[0] == 0xFE && content[1] == 0xFF {
        let u16_words: Vec<u16> = content[2..].chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        return String::from_utf16(&u16_words).map_err(|e| format!("UTF-16BE解码失败: {}", e));
    }

    // 无 BOM UTF-16 智能检测
    let null_count = content.iter().filter(|&&b| b == 0).count();
    if content.len() > 4 && null_count > content.len() / 3 && content.len() % 2 == 0 {
        let first_le = u16::from_le_bytes([content[0], content[1]]);
        let second_le = u16::from_le_bytes([content[2], content[3]]);
        if first_le < 256 && second_le < 256 {
            let u16_words: Vec<u16> = content.chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
            if let Ok(text) = String::from_utf16(&u16_words) { return Ok(text); }
        }
    }

    // UTF-8
    if let Ok(text) = String::from_utf8(content.clone()) {
        return Ok(text);
    }

    // GBK
    {
        let (cow, _, had) = encoding_rs::GBK.decode(&content);
        if !had && !cow.is_empty() {
            return Ok(cow.into_owned());
        }
    }

    // BIG5
    {
        let (cow, _, had) = encoding_rs::BIG5.decode(&content);
        if !had && !cow.is_empty() {
            return Ok(cow.into_owned());
        }
    }

    // 保底
    Ok(String::from_utf8_lossy(&content).to_string())
}

pub fn read_epub_file(path: &str) -> Result<String, String> {
    let content = std::fs::read(path).map_err(|e| format!("读取EPUB失败: {}", e))?;
    let text = String::from_utf8_lossy(&content);
    let text = strip_html_tags(&text);
    let cleaned: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    Ok(cleaned.join("\n"))
}

pub fn read_html_file(path: &str) -> Result<String, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("读取HTML失败: {}", e))?;
    let body = if let Some(start) = content.find("<body") {
        let s = content[start..].find('>').map(|i| start + i + 1).unwrap_or(0);
        let e = content.find("</body>").unwrap_or(content.len());
        &content[s..e]
    } else {
        &content
    };
    let text = strip_html_tags(body);
    let cleaned: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    Ok(cleaned.join("\n"))
}

fn strip_html_tags(text: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_entity = false;
    let mut entity = String::new();
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            '&' => { in_entity = true; entity.clear(); }
            ';' if in_entity => {
                in_entity = false;
                match entity.as_str() {
                    "nbsp" => result.push(' '),
                    "lt" => result.push('<'),
                    "gt" => result.push('>'),
                    "amp" => result.push('&'),
                    "quot" => result.push('"'),
                    _ => {}
                }
            }
            _ if in_entity => entity.push(ch),
            _ => result.push(ch),
        }
    }
    result
}

pub fn extract_title(file_path: &str, content: &str) -> String {
    if file_path.ends_with(".txt") || file_path.ends_with(".TXT") {
        return std::path::Path::new(file_path)
            .file_stem().and_then(|s| s.to_str()).unwrap_or("未命名小说").to_string();
    }
    for line in content.lines() {
        let t = line.trim();
        if !t.is_empty() && t.len() < 50 {
            return t.to_string();
        }
    }
    std::path::Path::new(file_path)
        .file_stem().and_then(|s| s.to_str()).unwrap_or("未命名小说").to_string()
}

pub fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("book_{}", ts)
}
