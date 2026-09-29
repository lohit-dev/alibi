use super::{db, today, R};
use crate::{
    models::{
        DailyStatistics, DashboardWidget, EndOfDayStatus, MonthlyStatistics, PeriodStatistics,
    },
    AppState,
};
use chrono::Local;
use tauri::State;

#[tauri::command]
pub fn get_dashboard_widget(state: State<AppState>, date: Option<String>) -> R<DashboardWidget> {
    db(&state)?
        .dashboard_widget(&date.unwrap_or_else(today))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_statistics(state: State<AppState>, date: Option<String>) -> R<DailyStatistics> {
    db(&state)?
        .daily_statistics(&date.unwrap_or_else(today))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_monthly_statistics(
    state: State<AppState>,
    year: i32,
    month: u32,
) -> R<MonthlyStatistics> {
    db(&state)?
        .monthly_statistics(year, month)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_period_statistics(
    state: State<AppState>,
    start_date: String,
    end_date: String,
) -> R<PeriodStatistics> {
    db(&state)?
        .period_statistics(&start_date, &end_date)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_end_of_day_status(state: State<AppState>, date: Option<String>) -> R<EndOfDayStatus> {
    db(&state)?
        .end_of_day_status(
            &date.unwrap_or_else(today),
            &Local::now().format("%I:%M %p").to_string(),
        )
        .map_err(|e| e.to_string())
}
