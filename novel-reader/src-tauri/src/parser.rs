/// 章节解析和文件读取模块

use regex_lite::Regex;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chapter {
    pub index: usize,
    pub title: String,
    pub start_pos: usize,
    pub end_pos: usize,
}

/// 智能识别章节标题
pub fn parse_chapters(text: &str) -> Vec<Chapter> {
    let patterns = vec![
        r"^第\s*[一二三四五六七八九十百千万零\d]+章\b.*",
        r"^第\s*[一二三四五六七八九十百千万零\d]+节\b.*",
        r"^第\s*[一二三四五六七八九十百千万零\d]+卷\b.*",
        r"^第\s*\d+\s*章\b.*",
        r"^第\s*\d+\s*节\b.*",
        r"^第\s*\d+\s*卷\b.*",
        r"^(?i)chapter\s+\d+\b.*",
        r"^(?i)volume\s+\d+\b.*",
        r"^第\s*零\s*章\b.*",
        r"^序\s*章\b.*",
        r"^尾\s*声\b.*",
        r"^番\s*外\b.*",
    ];

    let mut chapters: Vec<Chapter> = Vec::new();
    let lines: Vec<&str> = text.lines().collect();
    let mut current_start: usize = 0;
    let mut current_title: String = String::new();
    let mut has_any_chapter = false;

    // 精确计算字符位置
    let line_offsets: Vec<usize> = {
        let mut offsets = Vec::with_capacity(lines.len() + 1);
        let mut pos = 0;
        for line in &lines {
            offsets.push(pos);
            pos += line.len() + 1;
        }
        offsets.push(pos);
        offsets
    };

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let is_chapter = patterns.iter().any(|p| {
            Regex::new(p).ok().map_or(false, |re| re.is_match(trimmed))
        });

        if is_chapter {
            has_any_chapter = true;
            if !current_title.is_empty() {
                let end_pos = line_offsets[i].saturating_sub(1);
                chapters.push(Chapter {
                    index: chapters.len(),
                    title: current_title.clone(),
                    start_pos: current_start,
                    end_pos,
                });
            }
            current_start = line_offsets[i];
            current_title = trimmed.to_string();
        }
    }

    // 最后一章
    let total_len = text.len();
    if has_any_chapter {
        if total_len > current_start && !current_title.is_empty() {
            chapters.push(Chapter {
                index: chapters.len(),
                title: current_title,
                start_pos: current_start,
                end_pos: total_len,
            });
        }
    } else {
        // 没找到任何章节标记，整篇作为一章
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

    // 先尝试 UTF-8
    if let Ok(text) = String::from_utf8(content.clone()) {
        return Ok(text);
    }

    // GBK/GB2312 中文编码
    let (text, _, _) = encoding_rs::GBK.decode(&content);
    if !text.is_empty() {
        return Ok(text.into_owned());
    }

    // BIG5 繁体
    let (text, _, _) = encoding_rs::BIG5.decode(&content);
    if !text.is_empty() {
        return Ok(text.into_owned());
    }

    // 保底
    Ok(String::from_utf8_lossy(&content).to_string())
}

/// 读取 EPUB（简易提取）
pub fn read_epub_file(path: &str) -> Result<String, String> {
    let content = std::fs::read(path).map_err(|e| format!("读取EPUB失败: {}", e))?;
    let text = String::from_utf8_lossy(&content);
    // 粗略提取可见文本
    let text = strip_html_tags(&text);
    let cleaned: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    Ok(cleaned.join("\n"))
}

/// 读取 HTML
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
            '&' => {
                in_entity = true;
                entity.clear();
            }
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
    for line in content.lines() {
        let t = line.trim();
        if !t.is_empty() && t.len() < 50 {
            return t.to_string();
        }
    }
    std::path::Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未命名小说")
        .to_string()
}

pub fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("book_{}", ts)
}
