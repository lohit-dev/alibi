use super::{changed, db, R};
use crate::{models::Profile, AppState};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_profile(state: State<AppState>) -> R<Option<Profile>> {
    db(&state)?.profile().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_profile(app: AppHandle, state: State<AppState>, profile: Profile) -> R<()> {
    db(&state)?
        .save_profile(&profile)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn clear_all_data(app: AppHandle, state: State<AppState>) -> R<()> {
    db(&state)?.clear_all_data().map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}
