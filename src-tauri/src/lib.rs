#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager, State};

mod parser;
mod fanqie;
mod comic;
use fanqie::{FanqieApi, FanqieSearchResult, FanqieBookInfo, FanqieChapter};
use parser::{parse_chapters, read_txt_file, read_epub_file, read_html_file, extract_title, generate_id, Chapter};

/// 全局 AppHandle，用于发送日志事件到前端
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Cookie 存储（Reqwest 要求 Arc）
static COOKIE_JAR: OnceLock<Arc<reqwest::cookie::Jar>> = OnceLock::new();

fn get_cookie_jar() -> Arc<reqwest::cookie::Jar> {
    COOKIE_JAR.get_or_init(|| {
        Arc::new(reqwest::cookie::Jar::default())
    }).clone()
}

// ===== 宏：简易调试输出（同时通过事件推送到前端） =====
macro_rules! debug_log {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        println!("[墨读] {}", &msg);
        let now = chrono::Local::now().format("%H:%M:%S%.3f").to_string();
        let payload = crate::LogPayload {
            level: "BACKEND".to_string(),
            message: msg,
            timestamp: now,
        };
        if let Some(handle) = crate::APP_HANDLE.get() {
            let _ = handle.emit("debug-log", &payload);
        }
    }};
}

// ===== 数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub total_chapters: usize,
    pub current_chapter: usize,
    pub progress: f64,
    pub chapters: Vec<Chapter>,
    pub content: String,
    pub favorite: bool,
    #[serde(default)]
    pub book_icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryData {
    pub books: Vec<Book>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogPayload {
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

/// 导入进度事件 payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub title: String,
    pub status: String,   // "processing" | "done" | "error"
    pub message: String,
}

/// 系统资源信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResource {
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub memory_pct: f64,
    pub process_mem_mb: f64,
    pub storage_app_mb: f64,
    pub storage_content_mb: f64,
}

pub struct AppState {
    pub library: Mutex<LibraryData>,
    pub data_dir: PathBuf,
    pub library_path: Mutex<String>,
    pub fanqie: FanqieApi,
    pub comic_library: Mutex<comic::ComicLibraryData>,
    pub render_dpi: Mutex<u32>,
    pub scan_cancel: Mutex<bool>,
}

// ===== 设置持久化 =====

use std::collections::HashMap;

fn load_settings(data_dir: &Path) -> HashMap<String, String> {
    let path = data_dir.join("settings.json");
    if !path.exists() {
        return HashMap::new();
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_setting(data_dir: &Path, key: &str, value: &str) {
    let path = data_dir.join("settings.json");
    let content = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let mut map: std::collections::HashMap<String, String> = serde_json::from_str(&content).unwrap_or_default();
    map.insert(key.to_string(), value.to_string());
    if let Ok(json) = serde_json::to_string_pretty(&map) {
        let _ = fs::write(&path, &json);
    }
}

// ===== 书库文件存储 =====

fn save_library(data_dir: &PathBuf, lib: &LibraryData) -> Result<(), String> {
    let path = data_dir.join("library.json");
    // 先清空 content 再保存（content 只用于运行时读取章节切片，不持久化）
    let stripped: Vec<Book> = lib.books.iter().map(|b| {
        let mut book = b.clone();
        book.content = String::new();
        book
    }).collect();
    let slim = LibraryData { books: stripped };
    let json = serde_json::to_string_pretty(&slim).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, &json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

fn load_library(data_dir: &PathBuf) -> LibraryData {
    let path = data_dir.join("library.json");
    if !path.exists() {
        return LibraryData { books: Vec::new() };
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    // library.json 不存 content，反序列化后 content 为空字符串
    serde_json::from_str(&content).unwrap_or(LibraryData { books: Vec::new() })
}

// ===== Tauri 命令 =====

#[tauri::command]
fn import_book(path: String, state: State<AppState>) -> Result<Book, String> {
    debug_log!("📥 导入书籍: {}", &path);

    let path_obj = PathBuf::from(&path);
    let ext = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    debug_log!("   文件类型: .{}", &ext);

    let content = match ext.as_str() {
        "txt" => read_txt_file(&path)?,
        "epub" => read_epub_file(&path)?,
        "html" | "htm" => read_html_file(&path)?,
        _ => return Err(format!("不支持的文件格式: .{}", ext)),
    };

    // 统一换行符
    let content = content.replace("\r\n", "\n").replace('\r', "\n");

    debug_log!("   内容长度: {} 字节", content.len());

    let chapters = parse_chapters(&content);
    debug_log!("   解析章节: {} 章", chapters.len());
    if !chapters.is_empty() {
        debug_log!("   第一章标题: {:?}", chapters[0].title);
    }
    let title = extract_title(&path, &content);
    debug_log!("   书名: {}", &title);
    let id = generate_id();
    let total_chapters = chapters.len();

    let book = Book {
        id,
        title,
        file_path: path,
        file_type: ext,
        total_chapters,
        current_chapter: 0,
        progress: 0.0,
        chapters,
        content,
        favorite: false,
        book_icon: String::new(),
    };

    let mut lib = state.library.lock().unwrap();
    lib.books.push(book.clone());
    save_library(&state.data_dir, &lib).ok();

    Ok(book)
}

/// 不依赖 state 的纯函数：从文件路径导入书籍（复用已有逻辑）
fn import_book_from_path(path: &str) -> Result<Book, String> {
    let path_obj = PathBuf::from(path);
    if !path_obj.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    let ext = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let content = match ext.as_str() {
        "txt" => read_txt_file(path)?,
        "epub" => read_epub_file(path)?,
        "html" | "htm" => read_html_file(path)?,
        _ => return Err(format!("不支持的小说文件格式: .{}", ext)),
    };
    let content = content.replace("\r\n", "\n").replace('\r', "\n");
    let chapters = parse_chapters(&content);
    let title = extract_title(path, &content);
    let id = generate_id();
    let total_chapters = chapters.len();

    Ok(Book {
        id, title,
        file_path: path.to_string(),
        file_type: ext,
        total_chapters,
        current_chapter: 0, progress: 0.0,
        chapters, content,
        favorite: false, book_icon: String::new(),
    })
}

const NOVEL_EXTS: &[&str] = &["txt", "epub", "html", "htm"];
const COMIC_EXTS: &[&str] = &["cbz", "zip", "pdf"];

/// 递归扫描目录，返回发现的未导入文件列表
fn scan_directory(dir: &Path, known_books: &[Book], known_comics: &[comic::ComicBook]) -> (Vec<String>, Vec<String>) {
    let mut novels = Vec::new();
    let mut comics = Vec::new();

    // 收集已有的绝对路径用于去重
    let known_book_paths: std::collections::HashSet<String> = known_books.iter()
        .filter_map(|b| Path::new(&b.file_path).canonicalize().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let known_comic_paths: std::collections::HashSet<String> = known_comics.iter()
        .filter_map(|c| Path::new(&c.source_path).canonicalize().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    if !dir.exists() {
        return (novels, comics);
    }

    fn visit_dir(
        dir: &Path,
        novels: &mut Vec<String>,
        comics: &mut Vec<String>,
        known_books: &std::collections::HashSet<String>,
        known_comics: &std::collections::HashSet<String>,
    ) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut has_image_dir = false;
        let mut child_dirs = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                child_dirs.push(path);
            } else if path.is_file() {
                let ext = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let raw_path = path.to_string_lossy().to_string();
                let canonical = match path.canonicalize() {
                    Ok(p) => p.to_string_lossy().to_string(),
                    Err(_) => raw_path.clone(),
                };

                if NOVEL_EXTS.contains(&ext.as_str()) {
                    if !known_books.contains(&canonical) {
                        novels.push(raw_path);
                    }
                } else if COMIC_EXTS.contains(&ext.as_str()) {
                    if !known_comics.contains(&canonical) {
                        comics.push(raw_path);
                    }
                } else if comic::is_image_ext(&ext) {
                    has_image_dir = true;
                }
            }
        }

        // 如果当前目录包含图片文件，且不是已知漫画，作为漫画文件夹导入
        if has_image_dir {
            let raw_dir = dir.to_string_lossy().to_string();
            let canonical_dir = dir.canonicalize()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| raw_dir.clone());
            if !known_comics.contains(&canonical_dir) {
                comics.push(raw_dir);
            }
        }

        // 递归子目录
        for child in child_dirs {
            visit_dir(&child, novels, comics, known_books, known_comics);
        }
    }

    visit_dir(dir, &mut novels, &mut comics, &known_book_paths, &known_comic_paths);
    (novels, comics)
}

#[tauri::command]
fn get_library(state: State<AppState>) -> Vec<Book> {
    let lib = state.library.lock().unwrap();
    debug_log!("📚 获取书库: {} 本书", lib.books.len());
    // 去掉 content 大字段再序列化，避免栈溢出
    let books = lib.books.iter().map(|b| {
        let mut book = b.clone();
        book.content = String::new();
        book
    }).collect();
    books
}

#[tauri::command]
fn get_chapter_content(book_id: String, chapter_index: usize, state: State<AppState>) -> Result<String, String> {
    debug_log!("📖 读取章节: book={}, chapter={}", &book_id, chapter_index);

    // 先提取必要信息后释放 lib 锁，避免借用冲突
    let need_reload: bool;
    let file_path: String;
    let start_pos: usize;
    let end_pos: usize;
    {
        let lib = state.library.lock().map_err(|e| format!("锁错误: {}", e))?;
        let book = lib.books.iter().find(|b| b.id == book_id).ok_or("未找到书籍")?;
        let chapter = book.chapters.get(chapter_index).ok_or("章节索引超出范围")?;
        debug_log!("   章节标题: {:?}", chapter.title);
        need_reload = book.content.is_empty();
        file_path = book.file_path.clone();
        start_pos = chapter.start_pos;
        end_pos = chapter.end_pos;
    }

    let content = if need_reload {
        debug_log!("   content 为空，从文件重新读取: {}", file_path);
        read_txt_file(&file_path)?.replace("\r\n", "\n").replace('\r', "\n")
    } else {
        // content 在内存中，可以正常读取
        let lib = state.library.lock().map_err(|e| format!("锁错误: {}", e))?;
        let book = lib.books.iter().find(|b| b.id == book_id).ok_or("未找到书籍")?;
        book.content.clone()
    };

    let end = end_pos.min(content.len());
    let start = start_pos.min(end);
    if start >= end {
        return Ok("(章节内容为空)".to_string());
    }
    Ok(content[start..end].to_string())
}

#[tauri::command]
fn update_progress(book_id: String, chapter_index: usize, state: State<AppState>) -> Result<(), String> {
    debug_log!("💾 更新进度: book={}, chapter={}", &book_id, chapter_index);
    let mut lib = state.library.lock().unwrap();
    let book = lib.books.iter_mut().find(|b| b.id == book_id).ok_or("未找到书籍")?;
    book.current_chapter = chapter_index;
    book.progress = if book.total_chapters > 0 {
        chapter_index as f64 / book.total_chapters as f64
    } else {
        0.0
    };
    debug_log!("   进度: {:.1}%", book.progress * 100.0);
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn remove_book(book_id: String, state: State<AppState>) -> Result<(), String> {
    debug_log!("🗑️ 删除书籍: {}", &book_id);
    let mut lib = state.library.lock().unwrap();
    lib.books.retain(|b| b.id != book_id);
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn reparse_book_chapters(book_id: String, state: State<AppState>) -> Result<(), String> {
    debug_log!("🔄 重新解析章节: book={}", &book_id);
    let mut lib = state.library.lock().unwrap();
    let book = lib.books.iter_mut().find(|b| b.id == book_id).ok_or("未找到书籍")?;
    let new_chapters = parse_chapters(&book.content);
    debug_log!("   旧章节数: {}, 新章节数: {}", book.chapters.len(), new_chapters.len());
    if !new_chapters.is_empty() {
        debug_log!("   第一章标题: {:?}", new_chapters[0].title);
    }
    book.chapters = new_chapters;
    book.total_chapters = book.chapters.len();
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn rename_book(book_id: String, new_title: String, state: State<AppState>) -> Result<(), String> {
    debug_log!("✏️ 重命名: book={} -> {}", &book_id, &new_title);
    let mut lib = state.library.lock().unwrap();
    let book = lib.books.iter_mut().find(|b| b.id == book_id).ok_or("未找到书籍")?;
    book.title = new_title;
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn toggle_favorite(book_id: String, state: State<AppState>) -> Result<(), String> {
    debug_log!("⭐ 切换收藏: book={}", &book_id);
    let mut lib = state.library.lock().unwrap();
    let book = lib.books.iter_mut().find(|b| b.id == book_id).ok_or("未找到书籍")?;
    book.favorite = !book.favorite;
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn save_book_order(book_ids: Vec<String>, state: State<AppState>) -> Result<(), String> {
    debug_log!("🔄 保存书库排序: {} 本书", book_ids.len());
    let mut lib = state.library.lock().unwrap();
    let mut reordered: Vec<Book> = Vec::with_capacity(book_ids.len());
    for id in &book_ids {
        if let Some(idx) = lib.books.iter().position(|b| b.id == *id) {
            reordered.push(lib.books.swap_remove(idx));
        }
    }
    // 补回未被排序的书籍
    for b in lib.books.drain(..) {
        if !reordered.iter().any(|r| r.id == b.id) {
            reordered.push(b);
        }
    }
    lib.books = reordered;
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn set_book_icon(book_id: String, icon: String, state: State<AppState>) -> Result<(), String> {
    debug_log!("🎨 设置封面图标: book={}, icon={}", &book_id, &icon);
    let mut lib = state.library.lock().unwrap();
    let book = lib.books.iter_mut().find(|b| b.id == book_id).ok_or("未找到书籍")?;
    book.book_icon = icon;
    save_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn open_file_location(path: String) -> Result<(), String> {
    debug_log!("📂 打开文件位置: {}", &path);
    let path_obj = PathBuf::from(&path);
    let _parent = path_obj.parent().unwrap_or(&path_obj);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开失败: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("打开失败: {}", e))?;
    }
    Ok(())
}

// ===== 在线搜索/下载 =====

/// 从 URL 中提取来源域名作为 Referer
fn extract_referer(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(domain) = parsed.host_str() {
            let scheme = parsed.scheme();
            // 如果 URL 路径包含 /book/ 或 /read/ 或 /chapter/，Referer 设为首页
            if parsed.path().contains("/book/") || parsed.path().contains("/read/") || parsed.path().contains("/chapter/") || parsed.path().contains("/content/") {
                return format!("{}://{}/", scheme, domain);
            }
            // 如果 URL 是搜索页面，Referer 也设为首页
            if parsed.path().contains("/search") || parsed.path().contains("/s.") {
                return format!("{}://{}/", scheme, domain);
            }
            // 否则设为当前 URL 的目录
            let mut referer = format!("{}://{}{}", scheme, domain, parsed.path());
            if !referer.ends_with('/') {
                referer.push('/');
            }
            return referer;
        }
    }
    // 保底
    "https://www.google.com/".to_string()
}

/// 联网请求（支持 GET/POST、动态 Referer、Cookie 持久化）
#[tauri::command]
async fn fetch_url(url: String, method: Option<String>, body: Option<String>, referer: Option<String>) -> Result<String, String> {
    debug_log!("🌐 请求URL: {} (method={:?})", &url, &method);

    let jar = get_cookie_jar();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .cookie_provider(jar)
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 确定 Referer
    let final_referer = referer.unwrap_or_else(|| extract_referer(&url));
    debug_log!("   Referer: {}", &final_referer);

    // 构造真实浏览器请求头
    let is_post = method.as_deref() == Some("POST");
    let req = if is_post {
        let b = body.unwrap_or_default();
        debug_log!("   POST body: {} 字节", b.len());
        client.post(&url).body(b)
    } else {
        client.get(&url)
    };

    let resp = req
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Referer", &final_referer)
        .header("DNT", "1")
        .header("Connection", "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "same-origin")
        .header("Sec-Fetch-User", "?1")
        .header("Sec-Ch-Ua", "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"")
        .header("Sec-Ch-Ua-Mobile", "?0")
        .header("Sec-Ch-Ua-Platform", "\"Windows\"")
        .header("Priority", "u=0, i")
        .send()
        .await
        .map_err(|e| {
            debug_log!("   ❌ 请求失败: {}", &e);
            format!("请求失败: {}", e)
        })?;

    let status = resp.status();
    if !status.is_success() {
        // 尝试读取响应体（即使失败了也可能有有用信息）
        let body_text = resp.text().await.unwrap_or_default();
        let snippet = body_text.chars().take(200).collect::<String>();
        debug_log!("   ❌ HTTP {} 响应片段: {}", status, &snippet);
        // 如果检测到 Cloudflare 拦截，给用户更明确的提示
        if snippet.contains("Just a moment") || snippet.contains("Checking your browser") || snippet.contains("cloudflare") {
            return Err(format!("该网站有 Cloudflare 防护，无法直接访问。可尝试：\n1. 换个没有 Cloudflare 的书源\n2. 在浏览器中手动打开该网站认证后再试\n3. 通过 Chrome MCP 浏览器代理访问"));
        }
        return Err(format!("HTTP {} - 服务器拒绝了请求: {}", status, snippet));
    }

    // 读取原始字节，自动检测编码
    let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败: {}", e))?;
    if bytes.is_empty() {
        return Err("响应为空，网站可能屏蔽了机器人访问".to_string());
    }

    // 尝试 UTF-8 → GBK → 自动检测
    let text = if let Ok(s) = String::from_utf8(bytes.to_vec()) {
        s
    } else {
        let (decoded, _, _) = encoding_rs::Encoding::for_label(b"utf-8")
            .unwrap_or(encoding_rs::UTF_8)
            .decode(&bytes);
        decoded.to_string()
    };

    debug_log!("   响应大小: {} 字节, 状态码: {}", bytes.len(), status);
    Ok(text)
}

/// 保存从网上下载的书籍到书库（直接传完整内容）
/// 可选 save_path：额外另存一份 .txt 文件到该路径
#[tauri::command]
fn save_online_book(title: String, author: String, content: String, save_path: Option<String>, state: State<AppState>) -> Result<Book, String> {
    debug_log!("💾 保存在线书籍: {} - {}", &title, &author);

    if content.trim().is_empty() {
        return Err("内容为空，无法保存".to_string());
    }

    let book = save_online_book_inner(&title, &author, &content, state)?;

    // 如果提供了 save_path，额外另存一份 .txt 文件
    if let Some(dir) = save_path {
        let dir_path = std::path::PathBuf::from(&dir);
        if dir_path.exists() || std::fs::create_dir_all(&dir_path).is_ok() {
            let file_name = format!("{}.txt", book.title.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '_', "").trim());
            let file_path = dir_path.join(&file_name);
            let txt_content = format!("{}\n\n{}", book.title, book.content);
            match std::fs::write(&file_path, &txt_content) {
                Ok(_) => debug_log!("   📄 已另存为: {:?}", file_path),
                Err(e) => debug_log!("   ⚠️ 另存失败: {}", e),
            }
        } else {
            debug_log!("   ⚠️ 路径不存在且无法创建: {}", &dir);
        }
    }

    Ok(book)
}

/// 返回用户本地小说工作区路径（用于下载保存 .txt）
#[tauri::command]
fn get_workspace_dir() -> String {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let path = PathBuf::from(home).join("Claude").join("Projects").join("本地小说");
    let path_str = path.to_string_lossy().to_string();
    debug_log!("   📁 工作区路径: {}", &path_str);
    path_str
}

// ===== 自定义书库路径 =====

/// 获取当前书库路径
#[tauri::command]
fn get_library_path(state: State<AppState>) -> String {
    state.library_path.lock().unwrap().clone()
}

/// 设置新书库路径
#[tauri::command]
fn set_library_path(new_path: String, state: State<AppState>) -> Result<(), String> {
    let path = PathBuf::from(&new_path);
    if !path.exists() {
        return Err("路径不存在".to_string());
    }
    if !path.is_dir() {
        return Err("请选择一个文件夹".to_string());
    }
    *state.library_path.lock().unwrap() = new_path.clone();
    save_setting(&state.data_dir, "library_path", &new_path);
    debug_log!("📂 书库路径已更改: {}", &new_path);
    Ok(())
}

/// 获取 PDF 渲染精度（DPI）
#[tauri::command]
fn get_render_dpi(state: State<AppState>) -> u32 {
    *state.render_dpi.lock().unwrap()
}

/// 设置 PDF 渲染精度（DPI），仅对新导入生效
#[tauri::command]
fn set_render_dpi(dpi: u32, state: State<AppState>) -> Result<(), String> {
    let dpi = dpi.clamp(72, 300);
    *state.render_dpi.lock().unwrap() = dpi;
    save_setting(&state.data_dir, "render_dpi", &dpi.to_string());
    debug_log!("🖼️ PDF 渲染精度已更改为: {} DPI", dpi);
    Ok(())
}

/// 扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub novels_found: usize,
    pub novels_imported: usize,
    pub comics_found: usize,
    pub comics_imported: usize,
    pub errors: Vec<String>,
}

/// 扫描书库路径并自动导入新文件（后台执行，通过事件返回结果）
#[tauri::command]
async fn scan_library(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<String, String> {
    // 清除取消标记
    *state.scan_cancel.lock().unwrap() = false;

    let lib_path = state.library_path.lock().unwrap().clone();
    if lib_path.is_empty() {
        return Err("请先设置书库路径".to_string());
    }
    let dir = PathBuf::from(&lib_path);
    if !dir.exists() {
        return Err(format!("书库路径不存在: {}", lib_path));
    }

    let data_dir = state.data_dir.clone();
    let render_dpi = *state.render_dpi.lock().unwrap();

    let (lib, comic_lib) = {
        let l = state.library.lock().unwrap();
        let cl = state.comic_library.lock().unwrap();
        (l.books.clone(), cl.comics.clone())
    };

    let (novels, comics) = scan_directory(&dir, &lib, &comic_lib);

    // 立即返回，后台处理导入
    let novels_found = novels.len();
    let comics_found = comics.len();
    let novels_list = novels.clone();
    let comics_list = comics.clone();

    std::thread::spawn(move || {
        debug_log!("📂 后台扫描: 发现 {} 本小说/{} 本漫画", novels_found, comics_found);

        let mut novels_imported = 0usize;
        let mut comics_imported = 0usize;
        let mut errors: Vec<String> = Vec::new();

        // 检查是否被取消
        let check_cancel = || -> bool {
            if let Ok(cancel_state) = app.state::<AppState>().scan_cancel.lock() {
                *cancel_state
            } else { false }
        };

        // 导入小说
        for path in &novels_list {
            if check_cancel() { break; }
            match import_book_from_path(path) {
                Ok(book) => {
                    let mut l = load_library(&data_dir);
                    l.books.push(book);
                    save_library(&data_dir, &l).ok();
                    novels_imported += 1;
                }
                Err(e) => errors.push(format!("导入小说失败 {}: {}", path, e)),
            }
        }

        // 导入漫画
        for (_idx, path) in comics_list.iter().enumerate() {
            if check_cancel() { break; }
            let path_obj = PathBuf::from(path);
            let file_name = path_obj.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("未知文件")
                .to_string();

            // 发送进度事件（复用导入 Toast）
            if let Some(handle) = crate::APP_HANDLE.get() {
                let _ = handle.emit("comic-import-progress", &crate::ImportProgress {
                    title: file_name.clone(),
                    status: "processing".to_string(),
                    message: format!("正在渲染 {} …", &file_name),
                });
            }

            if path_obj.is_dir() {
                match import_comic_folder_impl(&path_obj) {
                    Ok(book) => {
                        // 直接推入内存 Mutex 再写磁盘，确保 comics-refreshed 时已最新
                        if let Ok(mut mem) = app.state::<AppState>().comic_library.lock() {
                            mem.comics.push(book);
                            comic::save_comic_library(&data_dir, &mem).ok();
                        }
                        comics_imported += 1;
                    