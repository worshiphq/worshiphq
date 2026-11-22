mod bible;
mod licensing;
mod ewb;
mod extras;
mod media;
mod voice;
mod whisper;
mod stock;

use serde::Serialize;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// What the projector is showing, so a projector window that opens late can catch up.
#[derive(Default)]
struct OutputState {
    slide: Mutex<Option<String>>,
    black: Mutex<bool>,
    stage: Mutex<Option<String>>,
    alert: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct OutputSnapshot {
    slide: Option<String>,
    black: bool,
}

#[derive(Debug, Serialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// Lists the screens plugged into this computer, so the app can tell whether a projector is connected.
#[tauri::command]
fn list_displays(app: tauri::AppHandle) -> Vec<DisplayInfo> {
    let primary_pos = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.position().y));
    let monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return vec![DisplayInfo {
            id: 0,
            name: "Main screen".to_string(),
            width: 1920,
            height: 1080,
            is_primary: true,
        }];
    }
    monitors
        .iter()
        .enumerate()
        .map(|(i, m)| DisplayInfo {
            id: i as u32,
            name: m.name().cloned().unwrap_or_else(|| format!("Screen {}", i + 1)),
            width: m.size().width,
            height: m.size().height,
            is_primary: primary_pos
                .map(|p| p == (m.position().x, m.position().y))
                .unwrap_or(i == 0),
        })
        .collect()
}

#[tauri::command]
fn go_live(app: tauri::AppHandle, output: State<OutputState>, slide_json: String) -> Result<(), String> {
    *output.slide.lock().unwrap() = Some(slide_json.clone());
    *output.black.lock().unwrap() = false;
    if let Some(projection) = app.get_webview_window("projection") {
        projection
            .emit("slide-update", &slide_json)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn go_black(app: tauri::AppHandle, output: State<OutputState>) -> Result<(), String> {
    *output.black.lock().unwrap() = true;
    if let Some(projection) = app.get_webview_window("projection") {
        projection
            .emit("go-black", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn go_clear(app: tauri::AppHandle, output: State<OutputState>) -> Result<(), String> {
    *output.slide.lock().unwrap() = None;
    *output.black.lock().unwrap() = false;
    if let Some(projection) = app.get_webview_window("projection") {
        projection
            .emit("go-clear", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tauri's default WebView2 switches, plus letting videos and music play with sound without a click
/// (the projector window is never clicked).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// Opens (or moves) one of the output windows: the projector, or the stage display for the preacher and band.
async fn open_output_window(
    app: tauri::AppHandle,
    label: &str,
    route: &str,
    title: &str,
    monitor_index: Option<usize>,
) -> Result<(), String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.position().y));
    // Use the chosen screen, otherwise the first screen that is not the main one.
    let target = monitor_index
        .and_then(|i| monitors.get(i))
        .or_else(|| {
            monitors
                .iter()
                .find(|m| Some((m.position().x, m.position().y)) != primary_pos)
        })
        .or(monitors.first());
    let same_as_main = target
        .map(|m| Some((m.position().x, m.position().y)) == primary_pos)
        .unwrap_or(true);

    // Already open: just move it to the chosen screen.
    if let Some(win) = app.get_webview_window(label) {
        if let Some(mon) = target {
            let _ = win.set_fullscreen(false);
            let _ = win.set_position(tauri::PhysicalPosition::new(mon.position().x, mon.position().y));
            if !same_as_main {
                let _ = win.set_fullscreen(true);
            }
        }
        return Ok(());
    }

    let (x, y, w, h) = if let Some(mon) = target {
        let pos = mon.position();
        let size = mon.size();
        (pos.x, pos.y, size.width, size.height)
    } else {
        (0, 0, 1920, 1080)
    };

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External(format!("http://localhost:1420/#{route}").parse().unwrap())
    } else {
        WebviewUrl::App(format!("index.html#{route}").into())
    };

    let scale = target.map(|m| m.scale_factor()).unwrap_or(1.0);
    // Same browser settings as the main window (Tauri's defaults + videos/music may start with sound by themselves).
    let builder = WebviewWindowBuilder::new(&app, label, url)
        .title(title)
        .additional_browser_args(BROWSER_ARGS);
    let builder = if same_as_main {
        // Only one screen (e.g. testing on a laptop): a normal window you can move, resize and close.
        builder
            .inner_size(960.0, 540.0)
            .center()
            .decorations(true)
            .resizable(true)
    } else {
        builder
            .position(x as f64 / scale, y as f64 / scale)
            .inner_size(w as f64 / scale, h as f64 / scale)
            .decorations(false)
            .always_on_top(true)
            .fullscreen(true)
            .focused(false)
    };
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_projection_window(app: tauri::AppHandle, monitor_index: Option<usize>) -> Result<(), String> {
    open_output_window(app, "projection", "projection", "WorshipHQ — Projector", monitor_index).await
}

#[tauri::command]
async fn open_stage_window(app: tauri::AppHandle, monitor_index: Option<usize>) -> Result<(), String> {
    open_output_window(app, "stage", "stage", "WorshipHQ — Stage display", monitor_index).await
}

#[tauri::command]
async fn close_stage_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("stage") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn stage_is_open(app: tauri::AppHandle) -> bool {
    app.get_webview_window("stage").is_some()
}

/// Current slide, next slide, clock/timer and a message for the stage display.
#[tauri::command]
fn stage_update(app: tauri::AppHandle, output: State<OutputState>, state_json: String) -> Result<(), String> {
    *output.stage.lock().unwrap() = Some(state_json.clone());
    if let Some(win) = app.get_webview_window("stage") {
        win.emit("stage-update", &state_json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_stage_state(output: State<OutputState>) -> Option<String> {
    output.stage.lock().unwrap().clone()
}

/// A message across the bottom of the projector (e.g. a nursery call). Empty text removes it.
#[tauri::command]
fn send_alert(app: tauri::AppHandle, output: State<OutputState>, alert_json: String) -> Result<(), String> {
    *output.alert.lock().unwrap() = Some(alert_json.clone());
    if let Some(win) = app.get_webview_window("projection") {
        win.emit("alert-update", &alert_json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_alert_state(output: State<OutputState>) -> Option<String> {
    output.alert.lock().unwrap().clone()
}

#[tauri::command]
fn find_easyworship() -> Option<String> {
    extras::find_easyworship()
}

#[tauri::command]
async fn import_easyworship(folder: String) -> Result<Vec<extras::ImportedSong>, String> {
    extras::import_easyworship(&folder)
}

#[tauri::command]
async fn read_text_files(paths: Vec<String>) -> Result<Vec<extras::TextFile>, String> {
    extras::read_text_files(paths)
}

#[tauri::command]
async fn list_fonts() -> Vec<String> {
    extras::list_fonts()
}

#[tauri::command]
fn open_sound_settings() {
    extras::open_sound_settings();
}

#[tauri::command]
fn get_output_state(output: State<OutputState>) -> OutputSnapshot {
    OutputSnapshot {
        slide: output.slide.lock().unwrap().clone(),
        black: *output.black.lock().unwrap(),
    }
}

/// Play / pause / restart a video that is on the projector.
#[tauri::command]
fn media_control(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if let Some(projection) = app.get_webview_window("projection") {
        projection.emit("media-control", action).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn projection_is_open(app: tauri::AppHandle) -> bool {
    app.get_webview_window("projection").is_some()
}

#[tauri::command]
async fn media_import(app: tauri::AppHandle, paths: Vec<String>) -> Result<Vec<media::MediaFile>, String> {
    let files = media::import(&bible_dir(&app), paths)?;
    // Files added while the app is running must be allowed one by one, or the windows can't load them.
    for f in &files {
        let _ = app.asset_protocol_scope().allow_file(&f.path);
    }
    Ok(files)
}

#[tauri::command]
fn whisper_status(app: tauri::AppHandle) -> whisper::WhisperStatus {
    whisper::status(&bible_dir(&app))
}

#[tauri::command]
fn stock_bundled(app: tauri::AppHandle) -> Vec<stock::BundledStock> {
    let dir = app.path().resource_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let list = stock::bundled(&dir);
    for b in &list {
        let _ = app.asset_protocol_scope().allow_file(&b.path);
        let _ = app.asset_protocol_scope().allow_file(&b.thumb);
    }
    list
}

#[tauri::command]
fn stock_licence(app: tauri::AppHandle) -> Option<String> {
    let hwid = licensing::get_hardware_id().ok()?;
    licensing::licence_header(&hwid, &bible_dir(&app))
}

#[tauri::command]
async fn stock_download(app: tauri::AppHandle, url: String, ext: String, token: String, title: String, kind: String) -> Result<media::MediaFile, String> {
    let f = stock::download(&bible_dir(&app), &url, &ext, &token, &title, &kind)?;
    let _ = app.asset_protocol_scope().allow_file(&f.path);
    Ok(f)
}

#[tauri::command]
fn stock_progress(app: tauri::AppHandle, token: String, ext: String) -> u64 {
    stock::progress(&bible_dir(&app), &token, &ext)
}

#[tauri::command]
fn whisper_progress(app: tauri::AppHandle, model: Option<String>) -> whisper::WhisperProgress {
    whisper::progress(&bible_dir(&app), model.as_deref().unwrap_or("base"))
}

/// Loads the speech model and keeps it in memory while listening.
#[tauri::command]
async fn whisper_start(app: tauri::AppHandle, model: String) -> Result<(), String> {
    whisper::start_server(&bible_dir(&app), &model)
}

#[tauri::command]
fn whisper_stop() {
    whisper::stop_server();
}

#[tauri::command]
async fn whisper_install(app: tauri::AppHandle, model: Option<String>) -> Result<(), String> {
    whisper::install(&bible_dir(&app), model.as_deref().unwrap_or("base"))
}

/// One spoken sentence as a WAV file (sent as raw bytes) → text.
#[tauri::command]
async fn whisper_transcribe(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(wav) = request.body() else {
        return Err("Expected audio".into());
    };
    let model = request.headers().get("x-model").and_then(|v| v.to_str().ok()).unwrap_or("base").to_string();
    whisper::transcribe(&bible_dir(&app), &model, wav)
}

#[tauri::command]
fn list_easyworship_bibles() -> Vec<String> {
    ewb::list_easyworship_bibles()
}

#[tauri::command]
async fn import_easyworship_bible(app: tauri::AppHandle, path: String) -> Result<bible::BiblePack, String> {
    ewb::import_ewb(&bible_dir(&app), &path)
}

#[tauri::command]
async fn import_presentation(app: tauri::AppHandle, path: String) -> Result<Vec<String>, String> {
    let slides = media::import_presentation(&bible_dir(&app), &path)?;
    // Let the app windows load the new slide pictures.
    for slide in &slides {
        let _ = app.asset_protocol_scope().allow_file(slide);
    }
    Ok(slides)
}

#[tauri::command]
fn media_delete(app: tauri::AppHandle, path: String) -> Result<(), String> {
    media::delete(&bible_dir(&app), &path)
}

#[tauri::command]
fn voice_start(app: tauri::AppHandle, state: State<voice::VoiceState>) -> Result<(), String> {
    voice::start(&app, &state)
}

#[tauri::command]
fn voice_stop(state: State<voice::VoiceState>) {
    voice::stop(&state);
}

#[tauri::command]
async fn close_projection_window(app: tauri::AppHandle) -> Result<(), String> {
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
fn check_license(app: tauri::AppHandle, hwid: String) -> Result<licensing::LicenseStatus, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    licensing::check_license(&hwid, &data_dir)
}

#[tauri::command]
fn license_info(app: tauri::AppHandle) -> Result<licensing::LicenseInfo, String> {
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let hwid = licensing::get_hardware_id()?;
    licensing::license_info(&hwid, &data_dir)
}

#[tauri::command]
fn set_registered_to(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    licensing::set_registered_to(&data_dir, &name)
}

#[tauri::command]
fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::process::Command::new("explorer.exe").arg(&data_dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_license(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    licensing::remove_license(&data_dir)
}

#[tauri::command]
fn activate_license(app: tauri::AppHandle, hwid: String, key: String) -> Result<licensing::LicenseStatus, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    licensing::activate_license(&hwid, &key, &data_dir)
}

#[tauri::command]
fn generate_license_key(hwid: String) -> String {
    licensing::generate_key_for_hwid(&hwid)
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
        .manage(OutputState::default())
        .manage(voice::VoiceState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                if window.label() == "main" {
                    // Closing the main window closes everything, including the projector and the listener.
                    voice::stop(&app.state::<voice::VoiceState>());
                    whisper::stop_server();
                    if let Some(p) = app.get_webview_window("projection") {
                        let _ = p.destroy();
                    }
                    if let Some(p) = app.get_webview_window("stage") {
                        let _ = p.destroy();
                    }
                } else if window.label() == "projection" {
                    // Let the operator screen know the projector window was closed by hand.
                    let _ = app.emit("projection-closed", ());
                } else if window.label() == "stage" {
                    let _ = app.emit("stage-closed", ());
                }
            }
        })
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            // Pictures and videos live in our own media folder; let the app windows load them from there.
            let media_dir = media::media_dir(&data_dir);
            let _ = std::fs::create_dir_all(&media_dir);
            if let Err(e) = app.asset_protocol_scope().allow_directory(&media_dir, true) {
                eprintln!("[media] could not allow the media folder: {}", e);
            }
            if let Ok(entries) = std::fs::read_dir(media_dir.join("presentations")) {
                for e in entries.flatten() {
                    let _ = app.asset_protocol_scope().allow_directory(e.path(), true);
                }
            }
            if let Err(e) = bible::install_bundled_packs(&data_dir, &resource_dir) {
                eprintln!("[bible] failed to install bundled packs: {}", e);
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
            activate_license,
            remove_license,
            license_info,
            set_registered_to,
            open_data_folder,
            generate_license_key,
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
            get_output_state,
            media_control,
            projection_is_open,
            media_import,
            media_delete,
            import_presentation,
            list_easyworship_bibles,
            whisper_status,
            whisper_install,
            whisper_progress,
            list_fonts,
            whisper_start,
            whisper_stop,
            stock_bundled,
            stock_licence,
            stock_download,
            stock_progress,
            whisper_transcribe,
            import_easyworship_bible,
            voice_start,
            voice_stop,
            open_stage_window,
            close_stage_window,
            stage_is_open,
            stage_update,
            get_stage_state,
            send_alert,
            get_alert_state,
            find_easyworship,
            import_easyworship,
            read_text_files,
            open_sound_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorshipHQ Media");
}
