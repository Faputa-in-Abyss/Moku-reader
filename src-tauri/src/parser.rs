/// 章节解析和文件读取模块

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chapter {
    pub index: usize,
    pub title: String,
    pub start_pos: usize,
    pub end_pos: usize,
}

/// 智能识别章节标题
/// 逐行扫描文本，识别 "第x章/节/卷/回" 等中文章节标记并切分章节
/// 完全用字符串匹配，避免 regex_lite 对中文 Unicode 支持不足的问题
pub fn parse_chapters(text: &str) -> Vec<Chapter> {
    let lines: Vec<&str> = text.lines().collect();

    // 精确计算每行在原始文本中的字节偏移
    let line_offsets: Vec<usize> = {
        let mut offsets = Vec::with_capacity(lines.len() + 1);
        let mut pos = 0;
        for line in &lines {
            offsets.push(pos);
            pos += line.len() + 1; // +1 是换行符 \n
        }
        offsets.push(pos);
        offsets
    };

    /// 判断一行是否为章节标题
    fn is_chapter_line(line: &str) -> bool {
        let t = line.trim();
        if t.is_empty() || t.len() > 80 {
            return false;
        }

        // 独立章节标题关键词
        let standalone = ["序章", "尾声", "番外", "后记", "前言", "楔子", "引子"];
        for kw in &standalone {
            if t == *kw || t.starts_with(kw) {
                return true;
            }
        }

        // "Chapter" / "Volume" 不区分大小写
        let upper = t.to_uppercase();
        if upper.starts_with("CHAPTER") || upper.starts_with("VOLUME") {
            return true;
        }

        // 必须以 "第" 开头
        if !t.starts_with("第") {
            return false;
        }

        // 合法数字字符 + 空格
        fn is_num_or_space(c: char) -> bool {
            matches!(c,
                '零'|'一'|'二'|'三'|'四'|'五'|'六'|'七'|'八'|'九'|'十'|
                '百'|'千'|'万'|'亿'|'两'|
                '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|
                ' '|'\t'
            )
        }

        fn is_suffix(c: char) -> bool {
            matches!(c, '章'|'节'|'卷'|'回')
        }

        // 遍历 t 中 "第" 之后的部分
        let rest: Vec<char> = t.chars().skip(1).collect(); // 跳过 "第"
        let mut i = 0;
        let n = rest.len();

        // 先跳过所有空白字符
        while i < n && (rest[i] == ' ' || rest[i] == '\t') { i += 1; }

        // 必须有数字部分
        if i >= n || !is_num_or_space(rest[i]) {
            return false;
        }

        // 读数字部分（数字 + 中间可能的空格）
        while i < n && is_num_or_space(rest[i]) { i += 1; }

        // 跳过数字和章节后缀之间的空白
        while i < n && (rest[i] == ' ' || rest[i] == '\t') { i += 1; }

        // 结尾必须是章节后缀，或者后缀后有标题文字
        if i >= n || !is_suffix(rest[i]) {
            return false;
        }
        i += 1; // 跳过后缀

        // 后缀后可以有标题文字（最多到行尾，长度不超过 60 字）
        let remaining: String = rest[i..].iter().collect();
        let remaining_trimmed = remaining.trim();
        if remaining_trimmed.len() > 60 {
            return false;
        }

        true
    }

    let mut chapters: Vec<Chapter> = Vec::new();
    let mut current_start: usize = 0;
    let mut current_title: String = String::new();
    let mut has_any_chapter = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if is_chapter_line(trimmed) {
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

    // 最后一章收尾
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
