mod commands;
mod db;
mod error;
mod models;
mod validation;

use db::Database;
use std::path::PathBuf;
use tauri::Manager;

pub struct AppState {
    pub database_path: PathBuf,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("main window should exist");
                window_vibrancy::apply_vibrancy(
                    &window,
                    window_vibrancy::NSVisualEffectMaterial::HudWindow,
                    None,
                    Some(24.0),
                )
                .expect("failed to apply the rounded macOS window material");
            }

            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("alibi.sqlite3");
            Database::open(&database_path)?.migrate()?;
            app.manage(AppState { database_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_profile,
            commands::save_profile,
            commands::clear_all_data,
            commands::list_jobs,
            commands::save_job,
            commands::archive_job,
            commands::list_tasks,
            commands::save_task,
            commands::archive_task,
            commands::get_weekly_timesheet,
            commands::save_weekly_timesheet,
            commands::get_day_entries,
            commands::save_day_entries,
            commands::list_scheduled_items,
            commands::save_scheduled_item,
            commands::complete_scheduled_item,
            commands::get_dashboard_widget,
            commands::get_daily_statistics,
            commands::get_monthly_statistics,
            commands::get_period_statistics,
            commands::get_end_of_day_status,
            commands::export_profile,
            commands::import_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
