use super::Database;
use crate::{
    error::{AppError, AppResult},
    models::{
        DailyStatistics, DashboardWidget, EndOfDayStatus, MonthlyStatistics, PeriodStatistics,
    },
    validation,
};
use chrono::NaiveDate;
use rusqlite::params;

impl Database {
    pub fn period_statistics(&self, start: &str, end: &str) -> AppResult<PeriodStatistics> {
        let start_date = validation::date(start)?;
        let end_date = validation::date(end)?;
        if end_date < start_date {
            return Err(AppError::Validation(
                "period end must be on or after its start".into(),
            ));
        }
        if (end_date - start_date).num_days() > 3660 {
            return Err(AppError::Validation(
                "period cannot exceed ten years".into(),
            ));
        }

        let start_formatted = validation::format_date(&start_date);
        let end_formatted = validation::format_date(&end_date);
        let entries = self.entries(&start_formatted, &end_formatted)?;
        let total_minutes = entries.iter().map(|entry| entry.duration_minutes).sum();
        let active_days = entries
            .iter()
            .map(|entry| &entry.work_date)
            .collect::<std::collections::HashSet<_>>()
            .len() as i64;

        Ok(PeriodStatistics {
            start_date: start_formatted,
            end_date: end_formatted,
            total_minutes,
            active_days,
            entries,
        })
    }

    pub fn daily_statistics(&self, date: &str) -> AppResult<DailyStatistics> {
        let d = validation::date(date)?;
        let formatted_date = validation::format_date(&d);
        let entries = self.entries(&formatted_date, &formatted_date)?;
        let worked_minutes = entries.iter().map(|x| x.duration_minutes).sum();
        Ok(DailyStatistics {
            date: formatted_date,
            worked_minutes,
            formatted_worked_time: fmt_minutes(worked_minutes),
            expected_minutes: self.expected_minutes()?,
            has_data: !entries.is_empty(),
            entries,
        })
    }

    pub fn monthly_statistics(&self, year: i32, month: u32) -> AppResult<MonthlyStatistics> {
        if !(1..=12).contains(&month) {
            return Err(AppError::Validation("month must be 1 to 12".into()));
        }
        let start = NaiveDate::from_ymd_opt(year, month, 1).unwrap();
        let end = if month == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap()
        } else {
            NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap()
        };
        let c = self.conn()?;
        let total_minutes = c.query_row(
            "SELECT COALESCE(SUM(duration_minutes), 0) FROM time_entries
             WHERE work_date >= ?1 AND work_date < ?2",
            params![
                start.format("%Y-%m-%d").to_string(),
                end.format("%Y-%m-%d").to_string()
            ],
            |r| r.get(0),
        )?;
        let working_days_with_entries = c.query_row(
            "SELECT COUNT(DISTINCT work_date) FROM time_entries
             WHERE work_date >= ?1 AND work_date < ?2",
            params![
                start.format("%Y-%m-%d").to_string(),
                end.format("%Y-%m-%d").to_string()
            ],
            |r| r.get(0),
        )?;
        Ok(MonthlyStatistics {
            year,
            month,
            total_minutes,
            formatted_total_time: fmt_minutes(total_minutes),
            working_days_with_entries,
        })
    }

    pub fn dashboard_widget(&self, date: &str) -> AppResult<DashboardWidget> {
        let d = validation::date(date)?;
        let formatted_date = validation::format_date(&d);
        let stat = self.daily_statistics(&formatted_date)?;
        let from = format!("{} 12:00 AM", formatted_date);
        let day_end = format!("{} 11:59 PM", formatted_date);

        let today = self.scheduled_items(&from, Some(&day_end))?;
        let completed = today.iter().filter(|x| x.completed).count() as i64;
        let open = today.len() as i64 - completed;
        let upcoming = self
            .scheduled_items(&from, None)?
            .into_iter()
            .filter(|item| !item.completed)
            .take(8)
            .collect();

        Ok(DashboardWidget {
            date: formatted_date,
            worked_minutes: stat.worked_minutes,
            formatted_worked_time: stat.formatted_worked_time,
            expected_minutes: stat.expected_minutes,
            has_data: stat.has_data,
            completed_scheduled_items: completed,
            open_scheduled_items: open,
            today_entries: stat.entries,
            upcoming,
        })
    }

    pub fn end_of_day_status(&self, date: &str, now: &str) -> AppResult<EndOfDayStatus> {
        let d = validation::date(date)?;
        let formatted_date = validation::format_date(&d);
        let stat = self.daily_statistics(&formatted_date)?;
        let today = chrono::Local::now().date_naive();
        let finished = if d < today {
            true
        } else if d > today {
            false
        } else {
            self.profile()?
                .map(
                    |p| match (validation::time(now), validation::time(&p.workday_end)) {
                        (Ok(current), Ok(end)) => current >= end,
                        _ => false,
                    },
                )
                .unwrap_or(false)
        };
        Ok(EndOfDayStatus {
            date: formatted_date,
            is_workday_finished: finished,
            expected_minutes: stat.expected_minutes,
            has_data: stat.has_data,
            logged_minutes: stat.worked_minutes,
            formatted_logged_time: stat.formatted_worked_time,
            entries: stat.entries,
        })
    }
}

fn fmt_minutes(m: i64) -> String {
    format!("{}:{:02}", m / 60, m % 60)
}
