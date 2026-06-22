mod bible;
mod licensing;

use serde::Serialize;
use tauri::Manager;

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
    // TODO: enumerate monitors using Windows API / Tauri window API
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
    // Send slide data to projection window
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
fn get_hwid() -> Result<String, String> {
    licensing::get_hardware_id()
}

#[tauri::command]
fn check_license(hwid: String) -> Result<licensing::LicenseStatus, String> {
    licensing::check_license(&hwid)
}

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
        .invoke_handler(tauri::generate_handler![
            list_displays,
            go_live,
            go_black,
            go_clear,
            get_hwid,
            check_license,
            search_bible,
            search_bible_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorshipHQ Media");
}
