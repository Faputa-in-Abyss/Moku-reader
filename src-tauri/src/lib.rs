#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, State};

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

pub struct AppState {
    pub library: Mutex<LibraryData>,
    pub data_dir: PathBuf,
    pub fanqie: FanqieApi,
    pub comic_library: Mutex<comic::ComicLibraryData>,
}

// ===== 书库文件存储 =====

fn save_library(data_dir: &PathBuf, lib: &LibraryData) -> Result<(), String> {
    let path = data_dir.join("library.json");
    let json = serde_json::to_string_pretty(lib).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, &json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

fn load_library(data_dir: &PathBuf) -> LibraryData {
    let path = data_dir.join("library.json");
    if !path.exists() {
        return LibraryData { books: Vec::new() };
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
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
    // 打印前5行内容，方便调试章节解析
    for (idx, line) in content.lines().take(5).enumerate() {
        debug_log!("   第{}行: {:?}", idx + 1, line);
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

#[tauri::command]
fn get_library(state: State<AppState>) -> Vec<Book> {
    let lib = state.library.lock().unwrap();
    debug_log!("📚 获取书库: {} 本书", lib.books.len());
    lib.books.clone()
}

#[tauri::command]
fn get_chapter_content(book_id: String, chapter_index: usize, state: State<AppState>) -> Result<String, String> {
    debug_log!("📖 读取章节: book={}, chapter={}", &book_id, chapter_index);
    let lib = match state.library.lock() {
        Ok(l) => l,
        Err(_) => return Ok("(内部错误：无法访问书库)".to_string()),
    };
    let book = match lib.books.iter().find(|b| b.id == book_id) {
        Some(b) => b,
        None => return Ok("(该书不存在，请重新导入)".to_string()),
    };
    let chapter = match book.chapters.get(chapter_index) {
        Some(c) => c,
        None => return Ok("(章节索引超出范围)".to_string()),
    };

    debug_log!("   内容长度: {}, 章节范围: {}-{}", book.content.len(), chapter.start_pos, chapter.end_pos);
    debug_log!("   章节标题: {:?}", chapter.title);
    if book.content.is_empty() {
        return Ok("(书籍内容为空，请重新导入)".to_string());
    }
    let content = &book.content;
    let end = chapter.end_pos.min(content.len());
    let start = chapter.start_pos.min(end);
    if start >= end {
        debug_log!("   ⚠️ 章节内容为空, start={}, end={}, content_len={}", start, end, content.len());
        return Ok("(章节内容为空)".to_string());
    }
    let chapter_text = &content[start..end];
    debug_log!("   返回内容长度: {} 字节", chapter_text.len());
    Ok(chapter_text.to_string())
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

// ===== 漫画命令 =====

#[tauri::command]
fn import_comic(path: String, state: State<AppState>) -> Result<comic::ComicBook, String> {
    debug_log!("📥 导入漫画: {}", &path);
    let book = comic::import_comic(&path, &state.data_dir)?;
    debug_log!("   导入成功: {} ({} 页)", &book.title, book.total_pages);

    let mut lib = state.comic_library.lock().unwrap();
    lib.comics.push(book.clone());
    comic::save_comic_library(&state.data_dir, &lib).ok();

    Ok(book)
}

#[tauri::command]
fn get_comic_library(state: State<AppState>) -> Vec<comic::ComicBook> {
    let lib = state.comic_library.lock().unwrap();
    debug_log!("📚 获取漫画书库: {} 本", lib.comics.len());
    lib.comics.clone()
}

#[tauri::command]
fn get_comic_page(comic_id: String, page_index: usize, state: State<AppState>) -> Result<String, String> {
    let lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    let page = comic.pages.get(page_index).ok_or("页码超出范围")?;

    // PDF 直接返回源文件路径，前端用 asset 协议读取
    // pdf.js 需禁用 range 请求，因为 Tauri asset 协议不支持 content-range 头
    if comic.source_type == "pdf" {
        let pdf_path = std::path::Path::new(&comic.image_dir).join(&page.filename);
        return Ok(pdf_path.to_string_lossy().to_string());
    }

    comic::get_page_base64(&comic.image_dir, &page.filename)
}

#[tauri::command]
fn get_comic_thumbnail(comic_id: String, state: State<AppState>) -> Result<String, String> {
    let lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    if comic.pages.is_empty() {
        return Err("漫画没有页面".to_string());
    }
    // PDF thumbnail 不在此处处理
    if comic.source_type == "pdf" {
        return Err("PDF 不支持后端缩略图".to_string());
    }
    let page = &comic.pages[0];
    comic::get_page_base64(&comic.image_dir, &page.filename)
}

#[tauri::command]
fn update_comic_progress(comic_id: String, page_index: usize, state: State<AppState>) -> Result<(), String> {
    let mut lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter_mut().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    comic.current_page = page_index;
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn update_comic_direction(comic_id: String, direction: String, state: State<AppState>) -> Result<(), String> {
    let mut lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter_mut().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    comic.direction = direction;
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn remove_comic(comic_id: String, state: State<AppState>) -> Result<(), String> {
    let mut lib = state.comic_library.lock().unwrap();
    lib.comics.retain(|c| c.id != comic_id);
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn rename_comic(comic_id: String, new_title: String, state: State<AppState>) -> Result<(), String> {
    let mut lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter_mut().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    comic.title = new_title;
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn toggle_comic_favorite(comic_id: String, state: State<AppState>) -> Result<(), String> {
    let mut lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter_mut().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    comic.favorite = !comic.favorite;
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn set_comic_icon(comic_id: String, icon: String, state: State<AppState>) -> Result<(), String> {
    let mut lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter_mut().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    comic.book_icon = icon;
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(())
}

#[tauri::command]
fn rescan_comic_folder(comic_id: String, state: State<AppState>) -> Result<usize, String> {
    let mut lib = state.comic_library.lock().unwrap();
    let comic = lib.comics.iter_mut().find(|c| c.id == comic_id).ok_or("未找到漫画")?;
    let new_pages = comic::rescan_folder(&comic.image_dir)?;
    let count = new_pages.len();
    comic.pages = new_pages;
    comic.total_pages = count;
    comic::save_comic_library(&state.data_dir, &lib).ok();
    Ok(count)
}

// ===== 番茄小说 API 命令 =====

/// 搜索番茄小说
#[tauri::command]
async fn fanqie_search(keyword: String, offset: Option<i32>, state: State<'_, AppState>) -> Result<FanqieSearchResult, String> {
    debug_log!("🍅 番茄搜索: {} (offset={:?})", &keyword, offset);
    let result = state.fanqie.search_books(&keyword, offset.unwrap_or(0)).await;
    match &result {
        Ok(r) => debug_log!("   结果: {} 本书", r.books.len()),
        Err(e) => debug_log!("   ❌ {}", e),
    }
    result
}

/// 获取番茄小说详情
#[tauri::command]
async fn fanqie_detail(book_id: String, state: State<'_, AppState>) -> Result<FanqieBookInfo, String> {
    debug_log!("🍅 番茄详情: book_id={}", &book_id);
    state.fanqie.get_book_detail(&book_id).await
}

/// 获取番茄小说目录
#[tauri::command]
async fn fanqie_catalog(book_id: String, state: State<'_, AppState>) -> Result<Vec<FanqieChapter>, String> {
    debug_log!("🍅 番茄目录: book_id={}", &book_id);
    state.fanqie.get_chapters(&book_id).await
}

/// 获取番茄小说章节内容
#[tauri::command]
async fn fanqie_content(item_id: String, state: State<'_, AppState>) -> Result<String, String> {
    debug_log!("🍅 番茄章节内容: item_id={}", &item_id);
    state.fanqie.get_chapter_content(&item_id).await
}

/// 下载整本番茄小说（逐章下载，发送进度事件）
#[tauri::command]
async fn fanqie_download(book_id: String, title: String, author: String, state: State<'_, AppState>, app: tauri::AppHandle) -> Result<String, String> {
    debug_log!("🍅 番茄下载: {} ({}) - {}", &title, &book_id, &author);

    let chapters = state.fanqie.get_chapters(&book_id).await?;
    let total = chapters.len();
    if total == 0 {
        return Err("没有可下载的章节".to_string());
    }

    debug_log!("   共 {} 章", total);

    let mut full_text = format!("{}\n作者：{}\n来源：番茄小说\n\n", &title, &author);
    let batch_size = 3;
    let mut failed = 0usize;

    for start in (0..total).step_by(batch_size) {
        let end = (start + batch_size).min(total);
        let batch = &chapters[start..end];

        let mut batch_results: Vec<(usize, String)> = Vec::new();
        for (i, ch) in batch.iter().enumerate() {
            let idx = start + i;
            match state.fanqie.get_chapter_content(&ch.id).await {
                Ok(content) => {
                    let header = format!("\n{}\n\n", ch.title);
                    batch_results.push((idx, header + &content + "\n"));
                }
                Err(_) => {
                    debug_log!("   ⚠️ 第{}章下载失败: {}", idx + 1, ch.title);
                    batch_results.push((idx, format!("\n{}\n(下载失败)\n\n", ch.title)));
                    failed += 1;
                }
            }
        }

        // 按原始顺序拼接
        batch_results.sort_by_key(|r| r.0);
        for (_, text) in batch_results {
            full_text += &text;
        }

        // 发送进度事件
        let _ = app.emit("fanqie-download-progress", &fanqie::FanqieDownloadProgress {
            current: end,
            total,
            message: format!("{}/{} 章", end, total),
        });
    }

    // 保存到书库
    let save_result = save_online_book_inner(
        &title, &author, &full_text, state
    ).map_err(|e| format!("保存失败: {}", e))?;

    let book_id_saved = save_result.id;

    if failed > 0 {
        debug_log!("   ⚠️ {} 章下载失败", failed);
    }
    debug_log!("   ✅ 下载完成，共 {} 章", total);

    Ok(book_id_saved)
}

/// 内部：保存在线书籍（避免重复代码）
fn save_online_book_inner(title: &str, author: &str, content: &str, state: State<'_, AppState>) -> Result<Book, String> {
    let content = content.replace("\r\n", "\n").replace('\r', "\n");
    let chapters = parse_chapters(&content);
    let id = generate_id();
    let total_chapters = chapters.len();

    let book = Book {
        id,
        title: if author.is_empty() { title.to_string() } else { format!("{} - {}", title, author) },
        file_path: String::new(),
        file_type: "online".to_string(),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("novel-reader");
    fs::create_dir_all(&data_dir).ok();

    let library = load_library(&data_dir);
    let comic_library = comic::load_comic_library(&data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            library: Mutex::new(library),
            data_dir,
            fanqie: fanqie::FanqieApi::new(),
            comic_library: Mutex::new(comic_library),
        })
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).map_err(|_| "APP_HANDLE already set")?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_book,
            get_library,
            get_chapter_content,
            update_progress,
            remove_book,
            reparse_book_chapters,
            rename_book,
            toggle_favorite,
            set_book_icon,
            open_file_location,
            fetch_url,
            save_online_book,
            get_workspace_dir,
            import_comic,
            get_comic_library,
            get_comic_page,
            get_comic_thumbnail,
            update_comic_progress,
            update_comic_direction,
            remove_comic,
            rename_comic,
            toggle_comic_favorite,
            set_comic_icon,
            rescan_comic_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
