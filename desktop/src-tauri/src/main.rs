// Windows entry point; the app itself is in lib.rs (shared with Android).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    three_d_cards_lib::run()
}
