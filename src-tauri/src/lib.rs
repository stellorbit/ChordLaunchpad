use std::{
    fs,
    path::PathBuf,
    sync::mpsc::channel,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{path::BaseDirectory, AppHandle, Manager, Runtime, Window};

fn sanitize_file_name(input: &str) -> String {
    let trimmed = input.trim();
    let mut safe = String::with_capacity(trimmed.len());

    for ch in trimmed.chars() {
        if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control() {
            continue;
        }
        if ch.is_whitespace() {
            safe.push('-');
        } else {
            safe.push(ch);
        }
    }

    let safe = safe.trim_matches('-');
    if safe.is_empty() {
        "chord-draft".to_string()
    } else {
        safe.to_string()
    }
}

fn ensure_midi_extension(file_name: &str) -> String {
    if file_name.to_ascii_lowercase().ends_with(".mid") {
        file_name.to_string()
    } else {
        format!("{file_name}.mid")
    }
}

fn write_drag_midi(bytes: &[u8], file_name: &str) -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let directory = std::env::temp_dir().join("chord-draft").join("drag-midi");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let path = directory.join(format!("{now}-{}", ensure_midi_extension(file_name)));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path)
}

fn candidate_icon_paths<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(path) = app.path().resolve("icons/32x32.png", BaseDirectory::Resource) {
        paths.push(path);
    }

    if let Ok(current_dir) = std::env::current_dir() {
        paths.push(current_dir.join("src-tauri").join("icons").join("32x32.png"));
        paths.push(current_dir.join("icons").join("32x32.png"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            paths.push(parent.join("icons").join("32x32.png"));
            paths.push(parent.join("..").join("icons").join("32x32.png"));
        }
    }

    paths
}

fn resolve_drag_icon<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    candidate_icon_paths(app)
        .into_iter()
        .find_map(|path| fs::canonicalize(path).ok())
        .ok_or_else(|| "ドラッグ用アイコンが見つかりません".to_string())
}

#[tauri::command]
fn start_midi_drag<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    bytes: Vec<u8>,
    file_name: String,
) -> Result<(), String> {
    let temp_file = write_drag_midi(&bytes, &sanitize_file_name(&file_name))?;
    let preview_icon = resolve_drag_icon(&app)?;
    let (tx, rx) = channel();

    app.run_on_main_thread(move || {
        #[cfg(target_os = "linux")]
        let raw_window = window.gtk_window();
        #[cfg(not(target_os = "linux"))]
        let raw_window = tauri::Result::Ok(window.clone());

        let result = match raw_window {
            Ok(raw_window) => drag::start_drag(
                &raw_window,
                drag::DragItem::Files(vec![temp_file]),
                drag::Image::File(preview_icon),
                |_result, _cursor_position| {},
                drag::Options::default(),
            )
            .map_err(|error| error.to_string()),
            Err(error) => Err(error.to_string()),
        };

        let _ = tx.send(result);
    })
    .map_err(|error| error.to_string())?;

    rx.recv().map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![start_midi_drag])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
