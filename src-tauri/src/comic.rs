use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// 支持的图片格式扩展名
const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
/// 会在 data_dir/comics/ 下创建副本的文件格式
pub const COPY_EXTS: &[&str] = &["cbz", "zip", "pdf"];

pub fn is_image_ext(ext: &str) -> bool {
    IMAGE_EXTS.contains(&ext)
}

// ===== 数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicPage {
    pub index: usize,
    pub filename: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicBook {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub source_path: String,
    pub image_dir: String,
    pub pages: Vec<ComicPage>,
    pub total_pages: usize,
    pub current_page: usize,
    pub direction: String,
    pub favorite: bool,
    #[serde(default)]
    pub book_icon: String,
}

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

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("comic_{}", ts)
}

fn is_image_file(name: &str) -> bool {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    IMAGE_EXTS.contains(&ext.as_str())
}

fn title_from_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未命名漫画")
        .to_string()
}

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
                i += 1; j += 1;
            }
        }
    });
}

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

pub fn probe_image_size(path: &Path) -> (u32, u32) {
    // 只读文件头部，不读整个文件
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return (0, 0),
    };
    use std::io::Read;
    // 读前 24 字节判断格式
    let mut header = [0u8; 24];
    if file.read(&mut header).unwrap_or(0) < 24 {
        return (0, 0);
    }
    // PNG: 前 8 字节签名 + IHDR 块
    if header[0..4] == [0x89, 0x50, 0x4E, 0x47] && header[12..16] == [0x49, 0x48, 0x44, 0x52] {
        let w = ((header[16] as u32) << 24) | ((header[17] as u32) << 16) | ((header[18] as u32) << 8) | (header[19] as u32);
        let h = ((header[20] as u32) << 24) | ((header[21] as u32) << 16) | ((header[22] as u32) << 8) | (header[23] as u32);
        return (w, h);
    }
    // JPEG: 逐段扫描直到找到 SOF 标记（只读前 1MB）
    if header[0..2] == [0xFF, 0xD8] {
        let mut buf = Vec::with_capacity(1024 * 1024);
        buf.extend_from_slice(&header);
        file.take(1024 * 1024 - 24).read_to_end(&mut buf).ok();
        let mut pos = 2;
        while pos + 7 < buf.len() {
            if buf[pos] != 0xFF { break; }
            if buf[pos+1] == 0xC0 || buf[pos+1] == 0xC1 || buf[pos+1] == 0xC2 {
                let h = ((buf[pos+5] as u32) << 8) | (buf[pos+6] as u32);
                let w = ((buf[pos+7] as u32) << 8) | (buf[pos+8] as u32);
                return (w, h);
            }
            let seg_len = ((buf[pos+2] as u32) << 8) | (buf[pos+3] as u32);
            pos += 2 + seg_len as usize;
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

pub fn import_folder(path: &Path) -> Result<(Vec<String>, String), String> {
    let files = scan_image_dir(path)?;
    let title = title_from_path(path.to_string_lossy().as_ref());
    Ok((files, title))
}

// ===== PDF 导入 =====

/// 导入 PDF：使用 mutool 命令行将 PDF 每页渲染为 PNG
use regex;

/// 快速获取 PDF 页数
fn get_pdf_page_count(mutool: &Path, path: &Path) -> usize {
    if let Ok(out) = Command::new(mutool).arg("pages").arg(path).output() {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let count = stdout.lines().filter(|l| l.trim().starts_with("page ")).count();
            if count > 0 { return count; }
            // fallback: 正则提取
            let re = regex::Regex::new(r"(?i)\bpage\s+(\d+)\b").expect("正则失败");
            if let Some(max) = re.captures_iter(&stdout).filter_map(|c| c.get(1)?.as_str().parse::<usize>().ok()).max() {
                if max > 0 { return max; }
            }
        }
    }
    // 尝试 mutool info
    if let Ok(out) = Command::new(mutool).arg("info").arg(path).output() {
        let text = String::from_utf8_lossy(&out.stdout);
        let re = regex::Regex::new(r"(?i)\bpages?:\s*(\d+)").expect("正则失败");
        if let Some(caps) = re.captures(&text) {
            if let Ok(n) = caps[1].parse::<usize>() { if n > 0 { return n; } }
        }
    }
    1 // 降级
}

/// 渲染单页 PNG（带 60 秒超时防止 mutool 挂死）
fn render_single_page(mutool: &Path, pdf_path: &Path, page_index: usize, dpi: u32, out_path: &Path) -> Result<(), String> {
    if out_path.exists() { return Ok(()); }
    fs::create_dir_all(out_path.parent().unwrap()).ok();

    let mut child = Command::new(mutool)
        .arg("draw")
        .arg("-o")
        .arg(out_path)
        .arg("-r")
        .arg(&dpi.to_string())
        .arg(pdf_path)
        .arg(&format!("{},{},{}", page_index + 1, page_index + 1, dpi))
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("mutool 启动失败: {}", e))?;

    let timeout = std::time::Duration::from_secs(60);
    let start = std::time::Instant::now();

    // 收集 stderr（失败时输出到日志）
    let capture_stderr = |child: &mut std::process::Child| -> String {
        child.stderr.take()
            .and_then(|mut s| {
                let mut buf = Vec::new();
                std::io::Read::read_to_end(&mut s, &mut buf).ok();
                Some(buf)
            })
            .map(|b| String::from_utf8_lossy(&b).to_string())
            .unwrap_or_default()
    };

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stderr = capture_stderr(&mut child);
                if status.success() { return Ok(()); }
                let _ = child.kill();
                return Err(format!("mutool 渲染失败: {}", stderr));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let pid = child.id();
                    let _ = child.kill();
                    let _ = child.wait(); // 回收僵尸进程
                    // 超时后清理可能的部分输出
                    let _ = std::fs::remove_file(&out_path);
                    return Err(format!("mutool 渲染超时（>60s），已终止进程 {}", pid));
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => {
                let _ = child.kill();
                return Err(format!("mutool wait 错误: {}", e));
            }
        }
    }
}

fn find_mutool() -> Option<PathBuf> {
    // 1. 从 exe 位置向上翻找 mutool/ 目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // 先看 exe 旁边
            for name in &["mutool.exe", "mutool"] {
                let candidate = exe_dir.join("mutool").join(name);
                if candidate.is_file() { return Some(candidate); }
                let candidate = exe_dir.join(name);
                if candidate.is_file() { return Some(candidate); }
            }
            // 从 exe 目录向上翻找（开发时 exe 在 src-tauri/target/debug/）
            let mut dir = exe_dir.to_path_buf();
            for _ in 0..5 {
                dir = match dir.parent() { Some(p) => p.to_path_buf(), None => break };
                let candidate = dir.join("mutool").join("mutool.exe");
                if candidate.is_file() { return Some(candidate); }
                let candidate = dir.join("mutool.exe");
                if candidate.is_file() { return Some(candidate); }
            }
        }
    }
    // 2. PATH 中找
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            for name in &["mutool.exe", "mutool"] {
                let candidate = dir.join(name);
                if candidate.is_file() { return Some(candidate); }
            }
        }
    }
    None
}

fn import_pdf(path: &Path, dest_dir: &Path, dpi: u32, num_threads: usize) -> Result<(Vec<String>, String), String> {
    let title = title_from_path(path.to_string_lossy().as_ref());
    let images_dir = dest_dir.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let mutool = find_mutool().ok_or_else(||
        "未找到 mutool，请下载 mupdf 后将 mutool.exe 放在可执行文件旁边或加入 PATH\n\
         下载地址: https://mupdf.com/downloads/"
    )?;

    // 先查页数
    let total = get_pdf_page_count(&mutool, path);
    if total == 0 {
        return Err("无法获取 PDF 页数".to_string());
    }

    // 多线程并行渲染，用 Arc<AtomicUsize> 追踪进度
    let num_threads = num_threads.max(1);
    let batch_size = (total + num_threads - 1) / num_threads;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    let rendered = Arc::new(AtomicUsize::new(0));
    let mut handles = Vec::new();
    for t in 0..num_threads {
        let m = mutool.clone();
        let pdf = path.to_path_buf();
        let out_dir = images_dir.clone();
        let start = t * batch_size;
        let end = total.min(start + batch_size);
        if start >= total { break; }
        let counter = Arc::clone(&rendered);
        handles.push(std::thread::spawn(move || {
            for i in start..end {
                let page_file = format!("page_{:04}.png", i + 1);
                let out_path = out_dir.join(&page_file);
                if let Err(e) = render_single_page(&m, &pdf, i, dpi, &out_path) {
                    println!("[墨读] ❌ 渲染失败 page {}: {}", i + 1, e);
                }
                let done = counter.fetch_add(1, Ordering::Relaxed) + 1;
                if done % 10 == 0 || done == total {
                    use tauri::Emitter;
                    let msg = format!("🖼️ PDF 渲染进度: {}/{} 页 ({:.0}%)", done, total, done as f64 / total as f64 * 100.0);
                    println!("[墨读] {}", &msg);
                    if let Some(handle) = crate::APP_HANDLE.get() {
                        let now = chrono::Local::now().format("%H:%M:%S%.3f").to_string();
                        let _ = handle.emit("debug-log", &serde_json::json!({
                            "level": "BACKEND",
                            "message": msg,
                            "timestamp": now,
                        }));
                    }
                }
            }
        }));
    }
    for h in handles { let _ = h.join(); }

    // 收集输出的文件
    let mut files: Vec<String> = (0..total)
        .map(|i| format!("page_{:04}.png", i + 1))
        .collect();
    sort_image_files(&mut files);

    Ok((files, title))
}

/// 渲染完成后删除 dest_dir 中可能残留的 PDF 副本（mutool 参数中的 path 就是源 PDF）
/// 但 import_pdf 不复制 PDF，所以只需要在 import_comic 返回后由调用方处理

// ===== 公开接口 =====

pub fn import_comic(path: &str, data_dir: &Path, dpi: u32, num_threads: usize) -> Result<ComicBook, String> {
    let path_obj = Path::new(path);
    if !path_obj.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let ext = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (mut files, title, source_type, image_dir, _dest_dir): (Vec<String>, String, String, PathBuf, Option<PathBuf>);

    match ext.as_str() {
        "cbz" | "zip" => {
            let dest = data_dir.join("comics").join(&generate_id());
            files = extract_cbz(path_obj, &dest)?;
            title = title_from_path(path);
            source_type = "cbz".to_string();
            image_dir = dest.clone();
            _dest_dir = Some(dest);
        }
        "pdf" => {
            let dest = data_dir.join("comics").join(&generate_id());
            let (f, t) = import_pdf(path_obj, &dest, dpi, num_threads)?;
            files = f;
            title = t;
            source_type = "pdf".to_string();
            image_dir = dest.join("images");
            _dest_dir = Some(dest);
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
            _dest_dir = None;
        }
    }

    if source_type == "folder" {
        sort_image_files(&mut files);
    }

    let pages: Vec<ComicPage> = files.iter().enumerate().map(|(i, fname)| {
        let full_path = image_dir.join(fname);
        let (w, h) = probe_image_size(&full_path);
        ComicPage { index: i, filename: fname.clone(), width: w, height: h }
    }).collect();

    let total = pages.len();
    let id = generate_id();

    Ok(ComicBook {
        id, title, source_type, source_path: path.to_string(),
        image_dir: image_dir.to_string_lossy().to_string(), pages,
        total_pages: total, current_page: 0, direction: "ltr".to_string(),
        favorite: false, book_icon: String::new(),
    })
}

/// 渲染完成后删除源文件副本（PDF/CBZ 会被复制到 data_dir）
/// 在 import_comic 成功返回后，立即清理源文件
pub fn cleanup_source_copy(path: &str, dest_dir: Option<&PathBuf>) {
    // 如果源文件在 data_dir/comics/ 下（即被复制过的），渲染完成后删除这个副本
    if let Some(dest) = dest_dir {
        // 检查是否有源文件副本在 dest 目录中
        let source_path = Path::new(path);
        if let Some(file_name) = source_path.file_name() {
            let copied = dest.join(file_name);
            if copied.exists() {
                let _ = fs::remove_file(&copied);
            }
        }
    }
}

/// 清理漫画导入产生的文件残留（应用于 PDF/CBZ，这些会复制到 data_dir）
pub fn cleanup_comic_files(comic: &ComicBook) {
    if comic.source_type == "pdf" {
        // PDF: image_dir = dest/images, 删除 dest 整个目录
        let images_dir = Path::new(&comic.image_dir);
        if let Some(dest) = images_dir.parent() {
            if dest.exists() {
                let _ = fs::remove_dir_all(dest);
            }
        }
    } else if comic.source_type == "cbz" {
        // CBZ: image_dir = dest（解压后目录）, 直接删除
        let dest = Path::new(&comic.image_dir);
        if dest.exists() {
            let _ = fs::remove_dir_all(dest);
        }
    }
}

pub fn get_page_base64(image_dir: &str, filename: &str) -> Result<String, String> {
    let path = Path::new(image_dir).join(filename);
    let data = fs::read(&path).map_err(|e| format!("读取图片失败: {}", e))?;
    let mime = if data.len() > 4 && data[..4] == [0x89, 0x50, 0x4E, 0x47] { "image/png" }
    else if data.len() > 2 && data[..2] == [0xFF, 0xD8] { "image/jpeg" }
    else if data.len() > 3 && data[..3] == [0x47, 0x49, 0x46] { "image/gif" }
    else { "image/png" };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

pub fn rescan_folder(image_dir: &str) -> Result<Vec<ComicPage>, String> {
    let dir = Path::new(image_dir);
    let files = scan_image_dir(dir)?;
    let pages: Vec<ComicPage> = files.iter().enumerate().map(|(i, fname)| {
        let full_path = dir.join(fname);
        let (w, h) = probe_image_size(&full_path);
        ComicPage { index: i, filename: fname.clone(), width: w, height: h }
    }).collect();
    Ok(pages)
}
