use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 确保字体已安装（首次启动时复制到用户字体目录）
pub fn ensure_fonts_installed(app_handle: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    ensure_fonts_installed_impl(app_handle);
}

#[cfg(target_os = "windows")]
fn ensure_fonts_installed_impl(app_handle: &tauri::AppHandle) {
    let font_dir = get_user_font_dir();
    if font_dir.is_err() { return; }
    let font_dir = font_dir.unwrap();
    if !font_dir.exists() {
        let _ = std::fs::create_dir_all(&font_dir);
    }

    // 标记文件存在于 user_font_dir，说明历史字体已全部装过
    let sentinel = font_dir.join(".moku_fonts_done");
    let sentinel_exists = sentinel.exists();

    // 扫描所有来源，只安装新字体
    let mut installed = 0;

    // 来源 1：内嵌资源包（如果标记文件存在则跳过 — 这些固定字体不会变）
    if !sentinel_exists {
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let bundled = resource_dir.join("fonts");
            if bundled.exists() {
                installed += install_fonts_from_dir(&bundled, &font_dir);
            }
        }
    }

    // 来源 2：用户字体目录 WordsType
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    if !local_appdata.is_empty() {
        let data_dir = std::path::Path::new(&local_appdata).join("novel-reader").join("WordsType");
        if data_dir.exists() {
            installed += install_fonts_from_dir(&data_dir, &font_dir);
        }
    }

    // 来源 3：开发环境项目根目录
    if let Ok(exe_dir) = std::env::current_dir() {
        let dev_dir = exe_dir.join("WordsType");
        if dev_dir.exists() {
            installed += install_fonts_from_dir(&dev_dir, &font_dir);
        }
    }

    if installed > 0 {
        println!("[字体] 本次新安装 {} 个字体", installed);
        notify_font_change();
        // 写入标记（只标记内置字体装完，用户字体每次仍需扫描）
        if !sentinel_exists {
            let _ = std::fs::write(&sentinel, "");
        }
    }
}

#[cfg(target_os = "windows")]
fn install_fonts_from_dir(src: &std::path::Path, font_dir: &std::path::Path) -> usize {
    let mut count = 0;
    let entries = match std::fs::read_dir(src) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        if ext != "ttf" && ext != "otf" { continue; }
        if ext == "ttf" && !path.to_string_lossy().to_lowercase().ends_with(".ttf") { continue; }
        if ext == "otf" && !path.to_string_lossy().to_lowercase().ends_with(".otf") { continue; }

        let filename = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let reg_name = reg_name_for(filename);

        if is_font_installed(&reg_name) { continue; }

        let dst = font_dir.join(filename);
        if let Err(e) = std::fs::copy(&path, &dst) {
            println!("[字体] 复制失败 {}: {}", filename, e);
            continue;
        }
        if let Err(e) = register_user_font(&reg_name, filename) {
            println!("[字体] 注册失败 {}: {}", filename, e);
            let _ = std::fs::remove_file(&dst);
            continue;
        }
        count += 1;
        println!("[字体] 已安装: {}", filename);
    }
    count
}

/// 根据文件名推断注册表名（不带扩展名 + (TrueType)/(OpenType)）
#[cfg(target_os = "windows")]
fn reg_name_for(filename: &str) -> String {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let base = std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    // 去掉可能的后缀如 -Regular, -Bold 等让注册表名更通用
    let type_tag = if ext == "otf" { " (OpenType)" } else { " (TrueType)" };
    format!("{}{}", base, type_tag)
}

#[cfg(target_os = "windows")]
fn get_user_font_dir() -> std::io::Result<std::path::PathBuf> {
    let local = std::env::var("LOCALAPPDATA")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::NotFound, "LOCALAPPDATA not set"))?;
    Ok(std::path::Path::new(&local).join("Microsoft").join("Windows").join("Fonts"))
}

#[cfg(target_os = "windows")]
fn is_font_installed(reg_name: &str) -> bool {
    let output = std::process::Command::new("reg")
        .args(["query", "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", "/v", reg_name])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(out) = output { if out.status.success() { return true; } }

    let output = std::process::Command::new("reg")
        .args(["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", "/v", reg_name])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(out) = output { if out.status.success() { return true; } }

    false
}

#[cfg(target_os = "windows")]
fn register_user_font(reg_name: &str, filename: &str) -> std::io::Result<()> {
    let output = std::process::Command::new("reg")
        .args([
            "add", "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
            "/v", reg_name, "/t", "REG_SZ", "/d", filename, "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    if output.status.success() {
        Ok(())
    } else {
        let msg = String::from_utf8_lossy(&output.stderr);
        Err(std::io::Error::new(std::io::ErrorKind::Other, msg.to_string()))
    }
}

#[cfg(target_os = "windows")]
fn notify_font_change() {
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command",
            "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; [System.Drawing.Font]::FromHfont([System.IntPtr]::Zero) | Out-Null"
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

