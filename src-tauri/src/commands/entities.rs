use super::{changed, db, R};
use crate::{
    models::{Job, Task},
    AppState,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_jobs(state: State<AppState>) -> R<Vec<Job>> {
    db(&state)?.jobs().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_job(app: AppHandle, state: State<AppState>, job: Job) -> R<Job> {
    let x = db(&state)?.save_job(&job).map_err(|e| e.to_string())?;
    changed(&app);
    Ok(x)
}

#[tauri::command]
pub fn archive_job(app: AppHandle, state: State<AppState>, job_id: String) -> R<()> {
    db(&state)?
        .archive_job(&job_id)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>, job_id: Option<String>) -> R<Vec<Task>> {
    db(&state)?
        .tasks(job_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_task(app: AppHandle, state: State<AppState>, task: Task) -> R<Task> {
    let x = db(&state)?.save_task(&task).map_err(|e| e.to_string())?;
    changed(&app);
    Ok(x)
}

#[tauri::command]
pub fn archive_task(app: AppHandle, state: State<AppState>, task_id: String) -> R<()> {
    db(&state)?
        .archive_task(&task_id)
        .map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}
