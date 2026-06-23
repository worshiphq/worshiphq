mod bible;
mod licensing;

use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Serialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[tauri::command]
fn list_displays() -> Vec<DisplayInfo> {
    vec![DisplayInfo {
        id: 0,
        name: "Primary Display".to_string(),
        width: 1920,
        height: 1080,
        is_primary: true,
    }]
}

#[tauri::command]
fn go_live(app: tauri::AppHandle, slide_json: String) -> Result<(), String> {
    if let Some(projection) = app.get_webview_window("projection") {
        projection
            .emit("slide-update", &slide_json)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn go_black(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(projection) = app.get_webview_window("projection") {
        projection
            .emit("go-black", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn go_clear(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(projection) = app.get_webview_window("projection") {
        projection
            .emit("go-clear", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_projection_window(app: tauri::AppHandle, monitor_index: Option<usize>) -> Result<(), String> {
    if app.get_webview_window("projection").is_some() {
        return Ok(());
    }

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let target = monitor_index
        .and_then(|i| monitors.get(i))
        .or_else(|| monitors.iter().find(|m| !m.name().unwrap_or_default().is_empty()).nth(1))
        .or(monitors.first());

    let (x, y, w, h) = if let Some(mon) = target {
        let pos = mon.position();
        let size = mon.size();
        (pos.x, pos.y, size.width, size.height)
    } else {
        (0, 0, 1920, 1080)
    };

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:1420/#projection".parse().unwrap())
    } else {
        WebviewUrl::App("index.html#projection".into())
    };

    WebviewWindowBuilder::new(&app, "projection", url)
        .title("WorshipHQ — Live Output")
        .position(x as f64, y as f64)
        .inner_size(w as f64, h as f64)
        .decorations(false)
        .always_on_top(true)
        .fullscreen(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn close_projection_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("projection") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_hwid() -> Result<String, String> {
    licensing::get_hardware_id()
}

#[tauri::command]
fn check_license(hwid: String) -> Result<licensing::LicenseStatus, String> {
    licensing::check_license(&hwid)
}

// ── Bible commands ──────────────────────────────────────────────

fn bible_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
}

#[tauri::command]
fn bible_list_packs(app: tauri::AppHandle) -> Result<Vec<bible::BiblePack>, String> {
    bible::list_packs(&bible_dir(&app))
}

#[tauri::command]
fn bible_get_chapter(
    app: tauri::AppHandle,
    pack_id: String,
    book: u32,
    chapter: u32,
) -> Result<Vec<bible::Verse>, String> {
    let db = bible_dir(&app).join("bibles").join(format!("{}.db", pack_id));
    bible::get_chapter_verses(&db.to_string_lossy(), book, chapter)
}

#[tauri::command]
fn bible_get_verses(
    app: tauri::AppHandle,
    pack_id: String,
    book: u32,
    chapter: u32,
    verse_start: u32,
    verse_end: u32,
) -> Result<Vec<bible::Verse>, String> {
    let db = bible_dir(&app).join("bibles").join(format!("{}.db", pack_id));
    bible::get_verses(&db.to_string_lossy(), book, chapter, verse_start, verse_end)
}

#[tauri::command]
fn bible_search(
    app: tauri::AppHandle,
    pack_id: String,
    query: String,
) -> Result<Vec<bible::Verse>, String> {
    let db = bible_dir(&app).join("bibles").join(format!("{}.db", pack_id));
    bible::search_text(&db.to_string_lossy(), &query)
}

#[tauri::command]
fn bible_chapter_count(
    app: tauri::AppHandle,
    pack_id: String,
    book: u32,
) -> Result<u32, String> {
    let db = bible_dir(&app).join("bibles").join(format!("{}.db", pack_id));
    bible::get_chapter_count(&db.to_string_lossy(), book)
}

#[tauri::command]
fn bible_verse_count(
    app: tauri::AppHandle,
    pack_id: String,
    book: u32,
    chapter: u32,
) -> Result<u32, String> {
    let db = bible_dir(&app).join("bibles").join(format!("{}.db", pack_id));
    bible::get_verse_count_for_chapter(&db.to_string_lossy(), book, chapter)
}

#[tauri::command]
fn bible_import_pack(
    app: tauri::AppHandle,
    source_path: String,
    pack_id: String,
) -> Result<bible::BiblePack, String> {
    bible::import_pack(&bible_dir(&app), &source_path, &pack_id)
}

#[tauri::command]
fn bible_delete_pack(app: tauri::AppHandle, pack_id: String) -> Result<(), String> {
    bible::delete_pack(&bible_dir(&app), &pack_id)
}

// Legacy commands kept for backward compat
#[tauri::command]
fn search_bible(
    db_path: String,
    book: u32,
    chapter: u32,
    verse_start: u32,
    verse_end: u32,
) -> Result<Vec<bible::Verse>, String> {
    bible::get_verses(&db_path, book, chapter, verse_start, verse_end)
}

#[tauri::command]
fn search_bible_text(db_path: String, query: String) -> Result<Vec<bible::Verse>, String> {
    bible::search_text(&db_path, &query)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            if let Err(e) = bible::ensure_demo_pack(&data_dir) {
                eprintln!("[bible] failed to create demo pack: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_displays,
            go_live,
            go_black,
            go_clear,
            open_projection_window,
            close_projection_window,
            get_hwid,
            check_license,
            search_bible,
            search_bible_text,
            bible_list_packs,
            bible_get_chapter,
            bible_get_verses,
            bible_search,
            bible_chapter_count,
            bible_verse_count,
            bible_import_pack,
            bible_delete_pack,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorshipHQ Media");
}
