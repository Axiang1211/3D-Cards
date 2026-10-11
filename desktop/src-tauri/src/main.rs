// 3D Cards desktop app: the website from ../public in a native window,
// using the WebView2 browser engine that comes with Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("failed to start 3D Cards");
}
