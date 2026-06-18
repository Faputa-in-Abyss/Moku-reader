/// 章节解析和文件读取模块
///
/// 章节识别：基于 Legado（开源阅读）txtTocRule.json 的多正则规则组合系统
/// 编码检测：UTF-8 / UTF-16 (LE/BE) / GBK / BIG5，含 BOM 和智能检测

use regex::Regex;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chapter {
    pub index: usize,
    pub title: String,
    pub start_pos: usize,
    pub end_pos: usize,
}

/// Legado 风格多规则章节识别系统
struct TocRuleSet {
    rules: Vec<Regex>,
    standalone: Vec<&'static str>,
}

impl TocRuleSet {
    fn new() -> Self {
        let rules = vec![
            // 规则 1: 标准章节（第X章/节/卷/回/篇/部/集）
            Regex::new(
                r"^[ 　\t]{0,4}第\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}[章节卷回篇部集](?:[ 　\t\-—、，,\.．：:]?\s*.*)?.{0,40}$"
            ).unwrap(),

            // 规则 2: 古典章回体（第X回/折/卷）
            Regex::new(
                r"^[ 　\t]{0,4}第[\d一二两三四五六七八九十百千万]+[回折卷]\s*.{0,30}$"
            ).unwrap(),

            // 规则 3: 纯数字章节（"001 标题"）
            Regex::new(
                r"^[ 　\t]{0,4}[\d]{2,}[ 　\t\.．、\-—\\/]\s*.{0,40}$"
            ).unwrap(),

            // 规则 4: 特殊符号开头 ☆★✦✧
            Regex::new(
                r"^[ 　\t]{0,4}[☆★✦✧].{1,30}$"
            ).unwrap(),

            // 规则 5: 英文章节
            Regex::new(
                r"^(?:CHAPTER|VOLUME|SECTION|CH\.|VOL\.?|SEC\.?|ACT|PART|BOOK|STAGE|SCENE)\s*[\dIVXLivxl\.\-]+\s*.{0,40}$"
            ).unwrap(),

            // 规则 6: 括号包裹的章节号
            Regex::new(
                r"^[\[（(][\d零一二三四五六七八九十百千万]+[\]）)][ 　\t]?.{0,40}$"
            ).unwrap(),

            // 规则 7: "正文" 开头
            Regex::new(
                r"^[ 　\t]{0,4}正文.{0,30}$"
            ).unwrap(),
        ];

        let standalone = vec!["序章", "楔子", "终章", "后记", "尾声", "番外", "内容简介", "文案", "前言", "引子"];

        Self { rules, standalone }
    }

    fn is_chapter_line(&self, line: &str) -> bool {
        let t = line.trim();
        if t.is_empty() || t.len() > 80 {
            return false;
        }
        if t.contains("本章完") || t.contains("本章结") || t == "正文完" || t == "正文结" {
            return false;
        }
        for kw in &self.standalone {
            if t == *kw || t.starts_with(kw) {
                return true;
            }
        }
        self.rules.iter().any(|re| re.is_match(t))
    }
}

/// 智能识别章节标题（基于 Legado 正则多规则系统）
pub fn parse_chapters(text: &str) -> Vec<Chapter> {
    let lines: Vec<&str> = text.lines().collect();

    // 计算每行在原始文本中的字节偏移
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

    let rules = TocRuleSet::new();

    let mut chapters: Vec<Chapter> = Vec::new();
    let mut current_start: usize = 0;
    let mut current_title: String = String::new();
    let mut has_any_chapter = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if rules.is_chapter_line(trimmed) {
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
/// 支持: UTF-8 / UTF-16LE / UTF-16BE（含 BOM 和无 BOM 智能检测）/ GBK / BIG5
pub fn read_txt_file(path: &str) -> Result<String, String> {
    let content = std::fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;

    if content.is_empty() {
        return Err("文件为空".to_string());
    }

    // === BOM 检测 ===

    // UTF-8 BOM (EF BB BF)
    if content.len() >= 3 && content[0] == 0xEF && content[1] == 0xBB && content[2] == 0xBF {
        if let Ok(text) = String::from_utf8(content[3..].to_vec()) {
            return Ok(text);
        }
    }

    // UTF-16LE BOM (FF FE)
    if content.len() >= 2 && content[0] == 0xFF && content[1] == 0xFE {
        let u16_words: Vec<u16> = content[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16_words)
            .map_err(|e| format!("UTF-16LE 解码失败: {}", e));
    }

    // UTF-16BE BOM (FE FF)
    if content.len() >= 2 && content[0] == 0xFE && content[1] == 0xFF {
        let u16_words: Vec<u16> = content[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16_words)
            .map_err(|e| format!("UTF-16BE 解码失败: {}", e));
    }

    // === 无 BOM 时的 UTF-16 智能检测 ===
    let null_count = content.iter().filter(|&&b| b == 0).count();
    if content.len() > 4 && null_count > content.len() / 3 && content.len() % 2 == 0 {
        let first_le = u16::from_le_bytes([content[0], content[1]]);
        let second_le = u16::from_le_bytes([content[2], content[3]]);
        if first_le < 256 && second_le < 256 {
            let u16_words: Vec<u16> = content
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            if let Ok(text) = String::from_utf16(&u16_words) {
                return Ok(text);
            }
        }
        let first_be = u16::from_be_bytes([content[0], content[1]]);
        let second_be = u16::from_be_bytes([content[2], content[3]]);
        if first_be < 256 && second_be < 256 {
            let u16_words: Vec<u16> = content
                .chunks_exact(2)
                .map(|c| u16::from_be_bytes([c[0], c[1]]))
                .collect();
            if let Ok(text) = String::from_utf16(&u16_words) {
                return Ok(text);
            }
        }
    }

    // === 单字节编码 ===

    // UTF-8
    if let Ok(text) = String::from_utf8(content.clone()) {
        return Ok(text);
    }

    // GBK / GB2312
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
    let cont