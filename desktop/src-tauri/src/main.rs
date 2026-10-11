// 3D Cards desktop app: the website from ../public in a native window,
// using the WebView2 browser engine that comes with Windows.
//
// Double-clicking a .3dcard file opens 3D Cards (or the window that is already
// open) and passes the card to the page, which saves it to the user's cards.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Card files given on the command line when the app started, waiting for the page to pick them up.
struct PendingCards(Mutex<Vec<String>>);

/// Reads the card files among command-line arguments (the first argument is the program itself).
fn card_files(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| {
            let l = a.to_lowercase();
            l.ends_with(".3dcard") || l.ends_with(".holocard.json")
        })
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .collect()
}

#[tauri::command]
fn take_opened_cards(state: tauri::State<PendingCards>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    tauri::Builder::default()
        // A second launch (another .3dcard double-clicked) goes to the open window instead.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            let files = card_files(&argv);
            if !files.is_empty() {
                let _ = app.emit("open-cards", files);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(PendingCards(Mutex::new(card_files(&args))))
        .invoke_handler(tauri::generate_handler![take_opened_cards])
        .run(tauri::generate_context!())
        .expect("failed to start 3D Cards");
}
