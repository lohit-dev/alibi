mod entities;
mod entries;
mod export;
mod profile;
mod schedule;
mod stats;

pub use entities::*;
pub use entries::*;
pub use export::*;
pub use profile::*;
pub use schedule::*;
pub use stats::*;

use crate::{db::Database, AppState};
use chrono::Local;
use tauri::{AppHandle, Emitter, State};

pub(super) type R<T> = Result<T, String>;

pub(super) fn db(state: &State<AppState>) -> R<Database> {
    Database::open(&state.database_path).map_err(|e| e.to_string())
}

pub(super) fn changed(app: &AppHandle) {
    let _ = app.emit("data-changed", ());
}

pub(super) fn today() -> String {
    Local::now().format("%d-%m-%Y").to_string()
}
