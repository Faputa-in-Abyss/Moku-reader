use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

mod parser;
use parser::{parse_chapters, read_txt_file, read_epub_file, read_html_file, extract_title, generate_id, Chapter};

// ===== 宏：简易调试输出 =====
macro_rules! debug_log {
    ($($arg:tt)*) => {
        println!("[墨读] {}", format!($($arg)*));
    };
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryData {
    pub books: Vec<Book>,
}

pub struct AppState {
    pub library: Mutex<LibraryData>,
    pub data_dir: PathBuf,
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
fn open_file_location(path: String) -> Result<(), String> {
    debug_log!("📂 打开文件位置: {}", &path);
    let path_obj = PathBuf::from(&path);
    let parent = path_obj.parent().unwrap_or(&path_obj);
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

// ===== 入口 =====

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("novel-reader");
    fs::create_dir_all(&data_dir).ok();

    let library = load_library(&data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            library: Mutex::new(library),
            data_dir,
        })
        .invoke_handler(tauri::generate_handler![
            import_book,
            get_library,
            get_chapter_content,
            update_progress,
            remove_book,
            rename_book,
            toggle_favorite,
            open_file_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
