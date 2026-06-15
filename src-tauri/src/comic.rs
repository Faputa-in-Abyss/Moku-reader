use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 支持的图片格式扩展名
const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];

// ===== 数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicPage {
    pub index: usize,
    /// 图片文件名（相对路径，相对于 image_dir）
    pub filename: String,
    /// 图片宽度（从头部读取，可能为 0）
    pub width: u32,
    /// 图片高度
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicBook {
    pub id: String,
    pub title: String,
    /// 来源类型: "cbz", "folder", "pdf"
    pub source_type: String,
    /// 导入时的原始路径
    pub source_path: String,
    /// 图片所在目录（CBZ 被解压后目录，或原始文件夹路径）
    pub image_dir: String,
    /// 页列表
    pub pages: Vec<ComicPage>,
    pub total_pages: usize,
    pub current_page: usize,
    /// 阅读方向: "ltr" | "rtl"
    pub direction: String,
    pub favorite: bool,
    #[serde(default)]
    pub book_icon: String,
}

// ===== 漫画书库持久化 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicLibraryData {
    pub comics: Vec<ComicBook>,
}

pub fn save_comic_library(data_dir: &Path, lib: &ComicLibraryData) -> Result<(), String> {
    let path = data_dir.join("comic_library.json");
    let json = serde_json::to_string_pretty(lib).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, &json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

pub fn load_comic_library(data_dir: &Path) -> ComicLibraryData {
    let path = data_dir.join("comic_library.json");
    if !path.exists() {
        return ComicLibraryData { comics: Vec::new() };
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or(ComicLibraryData { comics: Vec::new() })
}

// ===== ID 生成 =====

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("comic_{}", ts)
}

// ===== 图片检测 =====

fn is_image_file(name: &str) -> bool {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    IMAGE_EXTS.contains(&ext.as_str())
}

/// 从文件路径提取书名（去除扩展名）
fn title_from_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未命名漫画")
        .to_string()
}

/// 自然排序：对文件名列表按数字+字符串混合排序（如 page1, page2, page10）
fn sort_image_files(files: &mut Vec<String>) {
    files.sort_by(|a, b| {
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let mut i = 0;
        let mut j = 0;
        loop {
            if i >= a_chars.len() && j >= b_chars.len() { return std::cmp::Ordering::Equal; }
            if i >= a_chars.len() { return std::cmp::Ordering::Less; }
            if j >= b_chars.len() { return std::cmp::Ordering::Greater; }

            let ca = a_chars[i];
            let cb = b_chars[j];

            if ca.is_ascii_digit() && cb.is_ascii_digit() {
                let mut na = 0u64;
                while i < a_chars.len() && a_chars[i].is_ascii_digit() {
                    na = na.saturating_mul(10).saturating_add(a_chars[i].to_digit(10).unwrap_or(0) as u64);
                    i += 1;
                }
                let mut nb = 0u64;
                while j < b_chars.len() && b_chars[j].is_ascii_digit() {
                    nb = nb.saturating_mul(10).saturating_add(b_chars[j].to_digit(10).unwrap_or(0) as u64);
                    j += 1;
                }
                match na.cmp(&nb) {
                    std::cmp::Ordering::Equal => continue,
                    other => return other,
                }
            } else {
                let cmp = ca.to_ascii_lowercase().cmp(&cb.to_ascii_lowercase());
                if cmp != std::cmp::Ordering::Equal { return cmp; }
                i += 1;
                j += 1;
            }
        }
    });
}

/// 扫描文件夹中的图片，返回排序后的文件名列表
fn scan_image_dir(dir: &Path) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut files: Vec<String> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_image_file(&name) {
            files.push(name);
        }
    }
    if files.is_empty() {
        return Err("目录中没有找到图片文件".to_string());
    }
    sort_image_files(&mut files);
    Ok(files)
}

/// 尝试从 PNG/JPEG 头部读取尺寸
fn probe_image_size(path: &Path) -> (u32, u32) {
    let data = match fs::read(path) {
        Ok(d) => d,
        Err(_) => return (0, 0),
    };
    if data.len() < 24 { return (0, 0); }

    // PNG
    if data[0..4] == [0x89, 0x50, 0x4E, 0x47] && data[12..16] == [0x49, 0x48, 0x44, 0x52] {
        let w = ((data[16] as u32) << 24) | ((data[17] as u32) << 16) | ((data[18] as u32) << 8) | (data[19] as u32);
        let h = ((data[20] as u32) << 24) | ((data[21] as u32) << 16) | ((data[22] as u32) << 8) | (data[23] as u32);
        return (w, h);
    }
    // JPEG
    if data[0..2] == [0xFF, 0xD8] {
        let mut pos = 2;
        while pos + 7 < data.len() {
            if data[pos] != 0xFF { break; }
            if data[pos+1] == 0xC0 || data[pos+1] == 0xC1 || data[pos+1] == 0xC2 {
                let h = ((data[pos+5] as u32) << 8) | (data[pos+6] as u32);
                let w = ((data[pos+7] as u32) << 8) | (data[pos+8] as u32);
                return (w, h);
            }
            let seg_len = ((data[pos+2] as u32) << 8) | (data[pos+3] as u32);
            pos += 2 + seg_len as usize;
        }
    }
    // WEBP
    if data[0..4] == [0x52, 0x49, 0x46, 0x46] && data[8..12] == [0x57, 0x45, 0x42, 0x50] {
        let sub = &data[12..];
        if sub.len() > 5 && sub[0..4] == [0x56, 0x50, 0x38, 0x20] {
            let w = (((sub[5] as u32) << 8) | (sub[4] as u32)) & 0x3FFF;
            let h = (((sub[7] as u32) << 8) | (sub[6] as u32)) & 0x3FFF;
            return (w * 2, h * 2);
        }
        if sub.len() > 5 && sub[0..4] == [0x56, 0x50, 0x38, 0x4C] {
            let bits = ((sub[5] as u32)) | ((sub[4] as u32) << 8);
            let w = (bits & 0x3FFF) + 1;
            let h = ((bits >> 14) & 0x3FFF) + 1;
            return (w, h);
        }
    }
    (0, 0)
}

// ===== CBZ/ZIP 导入 =====

fn extract_cbz(source: &Path, dest_dir: &Path) -> Result<Vec<String>, String> {
    let file = fs::File::open(source).map_err(|e| format!("打开 CBZ 文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取 ZIP 文件失败: {}", e))?;

    let mut image_indexes: Vec<(String, usize)> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("读取条目失败: {}", e))?;
        let name = entry.name().to_string();
        if is_image_file(&name) {
            let fname = Path::new(&name).file_name().unwrap_or_default().to_string_lossy().to_string();
            image_indexes.push((fname, i));
        }
    }

    if image_indexes.is_empty() {
        return Err("CBZ 文件中没有找到图片".to_string());
    }

    image_indexes.sort_by_key(|(_, idx)| *idx);
    let ordered: Vec<String> = image_indexes.into_iter().map(|(n, _)| n).collect();

    fs::create_dir_all(dest_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("读取条目失败: {}", e))?;
        let entry_name = entry.name().to_string();
        if !is_image_file(&entry_name) { continue; }

        let fname = Path::new(&entry_name).file_name().unwrap_or_default().to_string_lossy().to_string();
        let out_path = dest_dir.join(&fname);

        let mut out_file = fs::File::create(&out_path).map_err(|e| format!("创建文件失败: {}", e))?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("解压文件失败: {}", e))?;
    }

    Ok(ordered)
}

// ===== 文件夹导入 =====

fn import_folder(path: &Path) -> Result<(Vec<String>, String), String> {
    let files = scan_image_dir(path)?;
    let title = title_from_path(path.to_string_lossy().as_ref());
    Ok((files, title))
}

// ===== PDF 导入 =====

/// 导入 PDF：将 PDF 元数据存入，实际渲染靠前端 pdf.js
fn import_pdf(path: &Path, dest_dir: &Path) -> Result<(Vec<String>, String), String> {
    let filename = path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown.pdf")
        .to_string();
    let title = title_from_path(path.to_string_lossy().as_ref());

    fs::create_dir_all(dest_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    let dest_path = dest_dir.join(&filename);
    fs::copy(path, &dest_path).map_err(|e| format!("复制 PDF 失败: {}", e))?;

    Ok((vec![filename], title))
}

// ===== 公开接口 =====

/// 导入漫画（CBZ / 文件夹 / PDF）
/// 返回 ComicBook（不含 base64 图片数据）
pub fn import_comic(path: &str, data_dir: &Path) -> Result<ComicBook, String> {
    let path_obj = Path::new(path);
    if !path_obj.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let ext = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (mut files, title, source_type, image_dir): (Vec<String>, String, String, PathBuf);

    match ext.as_str() {
        "cbz" | "zip" => {
            let dest = data_dir.join("comics").join(&generate_id());
            files = extract_cbz(path_obj, &dest)?;
            title = title_from_path(path);
            source_type = "cbz".to_string();
            image_dir = dest;
        }
        "pdf" => {
            let dest = data_dir.join("comics").join(&generate_id());
            let (f, t) = import_pdf(path_obj, &dest)?;
            files = f;
            title = t;
            source_type = "pdf".to_string();
            image_dir = dest;
        }
        _ => {
            if !path_obj.is_dir() {
                return Err(format!("不支持的文件格式: .{}，支持 CBZ/ZIP/PDF 或图片文件夹", ext));
            }
            let (f, t) = import_folder(path_obj)?;
            files = f;
            title = t;
            source_type = "folder".to_string();
            image_dir = path_obj.to_path_buf();
        }
    }

    if source_type == "folder" {
        sort_image_files(&mut files);
    }

    // 探测图片尺寸
    let pages: Vec<ComicPage> = files.iter().enumerate().map(|(i, fname)| {
        let full_path = image_dir.join(fname);
        let (w, h) = probe_image_size(&full_path);
        ComicPage {
            index: i,
            filename: fname.clone(),
            width: w,
            height: h,
        }
    }).collect();

    let total = pages.len();
    let id = generate_id();

    Ok(ComicBook {
        id,
        title,
        source_type,
        source_path: path.to_string(),
        image_dir: image_dir.to_string_lossy().to_string(),
        pages,
        total_pages: total,
        current_page: 0,
        direction: "ltr".to_string(),
        favorite: false,
        book_icon: String::new(),
    })
}

/// 读取一张漫画页面图片，返回 base64 的 data URL
pub fn get_page_base64(image_dir: &str, filename: &str) -> Result<String, String> {
    let path = Path::new(image_dir).join(filename);
    let data = fs::read(&path).map_err(|e| format!("读取图片失败: {}", e))?;

    let mime = if data.len() > 4 && data[..4] == [0x89, 0x50, 0x4E, 0x47] {
        "image/png"
    } else if data.len() > 2 && data[..2] == [0xFF, 0xD8] {
        "image/jpeg"
    } else if data.len() > 3 && data[..3] == [0x47, 0x49, 0x46] {
        "image/gif"
    } else if data.len() > 4 && data[8..12] == [0x57, 0x45, 0x42, 0x50] {
        "image/webp"
    } else {
        "image/png"
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// 重新扫描文件夹中的图片文件（用于文件夹来源的漫画）
pub fn rescan_folder(image_dir: &str) -> Result<Vec<ComicPage>, String> {
    let dir = Path::new(image_dir);
    let files = scan_image_dir(dir)?;

    let pages: Vec<ComicPage> = files.iter().enumerate().map(|(i, fname)| {
        let full_path = dir.join(fname);
        let (w, h) = probe_image_size(&full_path);
        ComicPage {
            index: i,
            filename: fname.clone(),
            width: w,
            height: h,
        }
    }).collect();

    Ok(pages)
}