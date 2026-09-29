use super::{changed, db, R};
use crate::AppState;
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn export_profile(state: State<AppState>, path: String) -> R<()> {
    db(&state)?
        .export(Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_profile(app: AppHandle, state: State<AppState>, path: String) -> R<()> {
    db(&state)?
        .import(Path::new(&path))
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}
