// 3D Cards app: the website from ../public in a native window — WebView2 on
// Windows, WKWebView on macOS, the system WebView on Android.
//
// Double-clicking a .3dcard file opens 3D Cards (or the window that is
// already open) and passes the card to the page, which saves it.
// Windows gives the file as a command-line argument; macOS sends it as an
// "open file" event (RunEvent::Opened).

use std::sync::Mutex;

/// Card files waiting for the page to pick them up. Once the page has asked
/// (`ready`), new cards are sent straight to it with the "open-cards" event.
struct Pending {
    ready: bool,
    cards: Vec<String>,
}

struct PendingCards(Mutex<Pending>);

fn is_card_file(path: &str) -> bool {
    let l = path.to_lowercase();
    l.ends_with(".3dcard") || l.ends_with(".holocard.json")
}

/// Reads the card files among command-line arguments (the first argument is the program itself).
fn card_files(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| is_card_file(a))
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .collect()
}

#[tauri::command]
fn take_opened_cards(state: tauri::State<PendingCards>) -> Vec<String> {
    let mut p = state.0.lock().unwrap();
    p.ready = true;
    std::mem::take(&mut p.cards)
}

/// True for the Microsoft Store (MSIX) app, which Windows installs under WindowsApps.
/// The Store updates that app itself, so the page does not offer 3D-Cards-Setup.exe.
#[tauri::command]
fn is_store_app() -> bool {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().contains("\\WindowsApps\\"))
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // A second launch (another .3dcard double-clicked) goes to the open window instead.
    #[cfg(desktop)]
    {
        use tauri::{Emitter, Manager};
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            let files = card_files(&argv);
            if !files.is_empty() {
                let _ = app.emit("open-cards", files);
            }
        }));
    }

    let app = builder
        .plugin(tauri_plugin_opener::init())
        .manage(PendingCards(Mutex::new(Pending {
            ready: false,
            cards: card_files(&args),
        })))
        .invoke_handler(tauri::generate_handler![take_opened_cards, is_store_app])
        .build(tauri::generate_context!())
        .expect("failed to start 3D Cards");

    app.run(|_app, _event| {
        // macOS: files double-clicked in Finder, or dropped on the Dock icon.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            use tauri::{Emitter, Manager};
            let files: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .filter(|p| is_card_file(&p.to_string_lossy()))
                .filter_map(|p| std::fs::read_to_string(p).ok())
                .collect();
            if files.is_empty() {
                return;
            }
            if let Some(w) = _app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            let state = _app.state::<PendingCards>();
            let mut p = state.0.lock().unwrap();
            if p.ready {
                let _ = _app.emit("open-cards", files);
            } else {
                // The page has not loaded yet: it picks these up with take_opened_cards.
                p.cards.extend(files);
            }
        }
    });
}
