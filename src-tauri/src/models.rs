use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct Profile {
    #[validate(length(min = 1, message = "name cannot be empty"))]
    pub name: String,
    pub company: Option<String>,
    pub workday_start: String,
    pub workday_end: String,
    #[validate(length(min = 1, message = "timezone cannot be empty"))]
    pub timezone: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct Job {
    pub id: String,
    #[validate(length(min = 1, message = "job name cannot be empty"))]
    pub name: String,
    pub archived: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct Task {
    pub id: String,
    #[validate(length(min = 1, message = "job id cannot be empty"))]
    pub job_id: String,
    #[validate(length(min = 1, message = "task name cannot be empty"))]
    pub name: String,
    pub archived: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeEntry {
    pub id: String,
    pub task_id: String,
    #[serde(default)]
    pub job_id: String,
    pub task_name: String,
    pub job_name: String,
    pub work_date: String,
    #[serde(default)]
    pub start_minute: i64,
    #[serde(default)]
    pub end_minute: i64,
    pub duration_minutes: i64,
    pub note: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct TimeEntryInput {
    #[validate(length(min = 1, message = "task id cannot be empty"))]
    pub task_id: String,
    #[validate(length(min = 10, max = 10, message = "date must use DD-MM-YYYY"))]
    pub work_date: String,
    #[validate(range(min = 0, max = 1439))]
    pub start_minute: i64,
    #[validate(range(min = 1, max = 1440))]
    pub end_minute: i64,
    pub note: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekCell {
    pub work_date: String,
    pub duration_minutes: i64,
    pub note: Option<String>,
    pub segments: Vec<TimeEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWeekRow {
    pub task: Task,
    pub cells: Vec<WeekCell>,
    pub total_minutes: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyTimesheet {
    pub job_id: String,
    pub week_start: String,
    pub days: Vec<String>,
    pub tasks: Vec<TaskWeekRow>,
    pub daily_totals_minutes: Vec<i64>,
    pub total_minutes: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledItem {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub scheduled_at: String,
    pub duration_minutes: Option<i64>,
    pub task_id: Option<String>,
    pub completed: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ScheduledItemInput {
    pub id: Option<String>,
    #[validate(length(min = 1, message = "schedule title cannot be empty"))]
    pub title: String,
    #[validate(length(min = 1, message = "schedule kind cannot be empty"))]
    pub kind: String,
    #[validate(length(
        min = 10,
        max = 35,
        message = "timestamp must use DD-MM-YYYY hh:mm AM/PM"
    ))]
    pub scheduled_at: String,
    #[validate(range(
        min = 1,
        max = 1440,
        message = "duration must be between 1 and 1,440 minutes"
    ))]
    pub duration_minutes: Option<i64>,
    pub task_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStatistics {
    pub date: String,
    pub worked_minutes: i64,
    pub formatted_worked_time: String,
    pub expected_minutes: i64,
    pub has_data: bool,
    pub entries: Vec<TimeEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyStatistics {
    pub year: i32,
    pub month: u32,
    pub total_minutes: i64,
    pub formatted_total_time: String,
    pub working_days_with_entries: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodStatistics {
    pub start_date: String,
    pub end_date: String,
    pub total_minutes: i64,
    pub active_days: i64,
    pub entries: Vec<TimeEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndOfDayStatus {
    pub date: String,
    pub is_workday_finished: bool,
    pub expected_minutes: i64,
    pub has_data: bool,
    pub logged_minutes: i64,
    pub formatted_logged_time: String,
    pub entries: Vec<TimeEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardWidget {
    pub date: String,
    pub worked_minutes: i64,
    pub formatted_worked_time: String,
    pub expected_minutes: i64,
    pub has_data: bool,
    pub completed_scheduled_items: i64,
    pub open_scheduled_items: i64,
    pub today_entries: Vec<TimeEntry>,
    pub upcoming: Vec<ScheduledItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportBundle {
    pub schema_version: u32,
    pub profile: Option<Profile>,
    pub jobs: Vec<Job>,
    pub tasks: Vec<Task>,
    pub time_entries: Vec<TimeEntry>,
    pub scheduled_items: Vec<ScheduledItem>,
}
