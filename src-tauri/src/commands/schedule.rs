use super::{changed, db, R};
use crate::{
    models::{ScheduledItem, ScheduledItemInput},
    AppState,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_scheduled_items(
    state: State<AppState>,
    from: String,
    to: Option<String>,
) -> R<Vec<ScheduledItem>> {
    db(&state)?
        .scheduled_items(&from, to.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_scheduled_item(
    app: AppHandle,
    state: State<AppState>,
    item: ScheduledItemInput,
) -> R<ScheduledItem> {
    let x = db(&state)?
        .save_scheduled_item(&item)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(x)
}

#[tauri::command]
pub fn complete_scheduled_item(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    completed: bool,
) -> R<()> {
    db(&state)?
        .complete_scheduled_item(&id, completed)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}
