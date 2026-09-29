use super::Database;
use crate::{
    error::{AppError, AppResult},
    models::{TaskWeekRow, TimeEntryInput, WeekCell, WeeklyTimesheet},
    validation,
};
use chrono::Duration;
use rusqlite::{params, OptionalExtension};
use std::collections::HashSet;
use uuid::Uuid;

impl Database {
    pub fn weekly_timesheet(&self, job_id: &str, week_start: &str) -> AppResult<WeeklyTimesheet> {
        let start = validation::date(week_start)?;
        let days = (0..7)
            .map(|n| validation::format_date(&(start + Duration::days(n))))
            .collect::<Vec<_>>();

        let tasks = self.tasks(Some(job_id))?;
        let entries = self.entries(&days[0], &days[6])?;

        let mut daily = vec![0i64; 7];
        let rows = tasks
            .into_iter()
            .map(|task| {
                let cells = days
                    .iter()
                    .enumerate()
                    .map(|(i, date)| {
                        let segments = entries
                            .iter()
                            .filter(|e| e.task_id == task.id && e.work_date == *date)
                            .cloned()
                            .collect::<Vec<_>>();
                        let mins = segments.iter().map(|x| x.duration_minutes).sum();
                        daily[i] += mins;
                        WeekCell {
                            work_date: date.clone(),
                            duration_minutes: mins,
                            note: segments.first().and_then(|x| x.note.clone()),
                            segments,
                        }
                    })
                    .collect::<Vec<_>>();
                let total_minutes = cells.iter().map(|x| x.duration_minutes).sum();
                TaskWeekRow {
                    task,
                    cells,
                    total_minutes,
                }
            })
            .collect();

        Ok(WeeklyTimesheet {
            job_id: job_id.into(),
            week_start: validation::format_date(&start),
            days,
            tasks: rows,
            daily_totals_minutes: daily.clone(),
            total_minutes: daily.iter().sum(),
        })
    }

    pub fn save_weekly_timesheet(
        &self,
        job_id: &str,
        week_start: &str,
        entries: &[TimeEntryInput],
    ) -> AppResult<WeeklyTimesheet> {
        let start = validation::date(week_start)?;
        let end = start + Duration::days(6);
        let mut seen = HashSet::new();
        let mut c = self.conn()?;
        let tx = c.transaction()?;

        tx.execute(
            "DELETE FROM time_entries
             WHERE work_date >= ?1 AND work_date <= ?2
               AND task_id IN (SELECT id FROM tasks WHERE job_id = ?3)",
            params![
                start.format("%Y-%m-%d").to_string(),
                end.format("%Y-%m-%d").to_string(),
                job_id
            ],
        )?;

        for e in entries {
            validation::validate(e)?;
            let d = validation::date(&e.work_date)?;

            if d < start || d > end {
                return Err(AppError::Validation(
                    "all entries must be inside the selected week".into(),
                ));
            }
            if e.end_minute <= e.start_minute || e.end_minute - e.start_minute > 1440 {
                return Err(AppError::Validation(
                    "time block must have a positive duration of at most 24 hours".into(),
                ));
            }
            if !seen.insert((&e.task_id, &e.work_date, e.start_minute, e.end_minute)) {
                return Err(AppError::Validation("duplicate time block".into()));
            }

            let belongs: Option<i64> = tx
                .query_row(
                    "SELECT 1 FROM tasks WHERE id = ?1 AND job_id = ?2",
                    params![e.task_id, job_id],
                    |r| r.get(0),
                )
                .optional()?;
            if belongs.is_none() {
                return Err(AppError::Validation(
                    "task does not belong to this job".into(),
                ));
            }

            let iso_date = d.format("%Y-%m-%d").to_string();

            insert_segment(&tx, e, &iso_date)?;
        }

        tx.commit()?;
        self.weekly_timesheet(job_id, &validation::format_date(&start))
    }

    pub fn daily_entries(
        &self,
        job_id: &str,
        date: &str,
    ) -> AppResult<Vec<crate::models::TimeEntry>> {
        let d = validation::date(date)?;
        let date = validation::format_date(&d);
        Ok(self
            .entries(&date, &date)?
            .into_iter()
            .filter(|entry| entry.job_id == job_id)
            .collect())
    }

    pub fn save_daily_entries(
        &self,
        job_id: &str,
        date: &str,
        entries: &[TimeEntryInput],
    ) -> AppResult<Vec<crate::models::TimeEntry>> {
        let d = validation::date(date)?;
        let iso_date = d.format("%Y-%m-%d").to_string();
        let mut seen = HashSet::new();
        let mut c = self.conn()?;
        let tx = c.transaction()?;

        for entry in entries {
            validation::validate(entry)?;
            if validation::date(&entry.work_date)? != d {
                return Err(AppError::Validation(
                    "all blocks must use the selected day".into(),
                ));
            }
            if entry.end_minute <= entry.start_minute
                || entry.end_minute - entry.start_minute > 1440
            {
                return Err(AppError::Validation(
                    "time block must have a positive duration of at most 24 hours".into(),
                ));
            }
            if !seen.insert((&entry.task_id, entry.start_minute, entry.end_minute)) {
                return Err(AppError::Validation("duplicate time block".into()));
            }
            let belongs: Option<i64> = tx
                .query_row(
                    "SELECT 1 FROM tasks WHERE id = ?1 AND job_id = ?2 AND archived = 0",
                    params![entry.task_id, job_id],
                    |row| row.get(0),
                )
                .optional()?;
            if belongs.is_none() {
                return Err(AppError::Validation(
                    "task does not belong to this job".into(),
                ));
            }
        }

        tx.execute(
            "DELETE FROM time_entries WHERE work_date = ?1 AND task_id IN
             (SELECT id FROM tasks WHERE job_id = ?2)",
            params![iso_date, job_id],
        )?;
        for entry in entries {
            insert_segment(&tx, entry, &iso_date)?;
        }
        tx.commit()?;
        self.daily_entries(job_id, &validation::format_date(&d))
    }
}

fn insert_segment(
    tx: &rusqlite::Transaction<'_>,
    entry: &TimeEntryInput,
    iso_date: &str,
) -> AppResult<()> {
    tx.execute(
        "INSERT INTO time_entries (id, task_id, work_date, start_minute, end_minute, duration_minutes, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![Uuid::new_v4().to_string(), entry.task_id, iso_date, entry.start_minute,
            entry.end_minute, entry.end_minute - entry.start_minute, entry.note],
    )?;
    Ok(())
}
