use super::{changed, db, R};
use crate::{
    models::{TimeEntryInput, WeeklyTimesheet},
    AppState,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_weekly_timesheet(
    state: State<AppState>,
    job_id: String,
    week_start: String,
) -> R<WeeklyTimesheet> {
    db(&state)?
        .weekly_timesheet(&job_id, &week_start)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_weekly_timesheet(
    app: AppHandle,
    state: State<AppState>,
    job_id: String,
    week_start: String,
    entries: Vec<TimeEntryInput>,
) -> R<WeeklyTimesheet> {
    let x = db(&state)?
        .save_weekly_timesheet(&job_id, &week_start, &entries)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(x)
}

#[tauri::command]
pub fn get_day_entries(
    state: State<AppState>,
    job_id: String,
    date: String,
) -> R<Vec<crate::models::TimeEntry>> {
    db(&state)?
        .daily_entries(&job_id, &date)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_day_entries(
    app: AppHandle,
    state: State<AppState>,
    job_id: String,
    date: String,
    entries: Vec<TimeEntryInput>,
) -> R<Vec<crate::models::TimeEntry>> {
    let saved = db(&state)?
        .save_daily_entries(&job_id, &date, &entries)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(saved)
}
