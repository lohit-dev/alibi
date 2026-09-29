// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(any(target_os = "android", target_os = "ios"))]
compile_error!("Alibi is a desktop application and supports only macOS, Windows, and Linux.");

fn main() {
    alibi_lib::run()
}
