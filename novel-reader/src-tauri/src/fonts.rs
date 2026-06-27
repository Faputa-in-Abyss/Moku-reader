use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 需要安装的字体列表（文件名 → 注册表名）
const FONTS_TO_CHECK: &[(&str, &str)] = &[
    ("HarmonyOS_SansSC_Regular.ttf",   "HarmonyOS Sans SC (TrueType)"),
    ("HarmonyOS_SansSC_Medium.ttf",    "HarmonyOS Sans SC Medium (TrueType)"),
    ("HarmonyOS_SansSC_Bold.ttf",      "HarmonyOS Sans SC Bold (TrueType)"),
    ("NotoSerifCJKsc-Regular.otf",     "Noto Serif CJK SC (OpenType)"),
    ("NotoSerifCJKsc-Medium.otf",      "Noto Serif CJK SC Medium (OpenType)"),
    ("NotoSerifCJKsc-Bold.otf",        "Noto Serif CJK SC Bold (OpenType)"),
    ("LXGWWenKai-Regular.ttf",         "LXGW WenKai (TrueType)"),
    ("LXGWWenKai-Medium.ttf",          "LXGW WenKai Medium (TrueType)"),
    ("LXGWMarkerGothic-Regular.ttf",   "LXGW Marker Gothic (TrueType)"),
    ("SmileySans-Oblique.ttf",         "Smiley Sans Oblique (TrueType)"),
];

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

    // 从资源包中解析字体文件路径
    let resource_dir = app_handle.path().resource_dir();
    if resource_dir.is_err() { return; }
    let resource_dir = resource_dir.unwrap().join("fonts");

    if !resource_dir.exists() { return; }

    let mut installed = 0;
    for (filename, reg_name) in FONTS_TO_CHECK {
        // 检查注册表是否已安装
        if is_font_installed(reg_name) {
            continue;
        }

        let src = resource_dir.join(filename);
        if !src.exists() { continue; }

        let dst = font_dir.join(filename);
        // 复制到用户字体目录
        if let Err(e) = std::fs::copy(&src, &dst) {
            println!("[字体] 复制失败 {}: {}", filename, e);
            continue;
        }

        // 写注册表（HKCU 无需管理员）
        if let Err(e) = register_user_font(reg_name, filename) {
            println!("[字体] 注册失败 {}: {}", filename, e);
            let _ = std::fs::remove_file(&dst);
            continue;
        }

        installed += 1;
    }

    if installed > 0 {
        println!("[字体] 本次新安装 {} 个字体", installed);
        notify_font_change();
    } else {
        println!("[字体] 所有字体已存在，跳过");
    }
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

