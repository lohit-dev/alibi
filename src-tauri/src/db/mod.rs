mod entities;
mod entries;
mod export;
mod profile;
mod schedule;
mod stats;

use crate::{error::AppResult, models::TimeEntry, validation};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;

pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn open(path: impl Into<PathBuf>) -> AppResult<Self> {
        Ok(Self { path: path.into() })
    }

    fn conn(&self) -> AppResult<Connection> {
        let connection = Connection::open(&self.path)?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(connection)
    }

    pub fn migrate(&self) -> AppResult<()> {
        self.conn()?.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;

             CREATE TABLE IF NOT EXISTS profile (
                 id            TEXT PRIMARY KEY,
                 name          TEXT NOT NULL,
                 company       TEXT,
                 workday_start TEXT NOT NULL,
                 workday_end   TEXT NOT NULL,
                 timezone      TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS jobs (
                 id       TEXT PRIMARY KEY,
                 name     TEXT NOT NULL,
                 archived INTEGER NOT NULL DEFAULT 0
             );

             CREATE TABLE IF NOT EXISTS tasks (
                 id       TEXT PRIMARY KEY,
                 job_id   TEXT NOT NULL REFERENCES jobs(id),
                 name     TEXT NOT NULL,
                 archived INTEGER NOT NULL DEFAULT 0
             );

             CREATE TABLE IF NOT EXISTS scheduled_items (
                 id               TEXT PRIMARY KEY,
                 title            TEXT NOT NULL,
                 kind             TEXT NOT NULL,
                 scheduled_at     TEXT NOT NULL,
                 duration_minutes INTEGER,
                 task_id          TEXT REFERENCES tasks(id),
                 completed        INTEGER NOT NULL DEFAULT 0
             );

             CREATE INDEX IF NOT EXISTS idx_schedule_at  ON scheduled_items(scheduled_at);",
        )?;

        let mut c = self.conn()?;
        let has_entries: bool = c.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='time_entries')",
            [],
            |row| row.get(0),
        )?;
        if has_entries {
            let mut statement = c.prepare("PRAGMA table_info(time_entries)")?;
            let columns = statement
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()?;
            if !columns.iter().any(|name| name == "start_minute") {
                c.execute_batch(
                    "ALTER TABLE time_entries RENAME TO time_entries_legacy;
                     CREATE TABLE time_entries (
                         id TEXT PRIMARY KEY,
                         task_id TEXT NOT NULL REFERENCES tasks(id),
                         work_date TEXT NOT NULL,
                         start_minute INTEGER NOT NULL,
                         end_minute INTEGER NOT NULL,
                         duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
                         note TEXT
                     );
                     INSERT INTO time_entries (id, task_id, work_date, start_minute, end_minute, duration_minutes, note)
                     SELECT id, task_id, work_date, 480, 480 + duration_minutes, duration_minutes, note
                     FROM time_entries_legacy;
                     DROP TABLE time_entries_legacy;",
                )?;
            }
        } else {
            c.execute_batch(
                "CREATE TABLE time_entries (
                     id TEXT PRIMARY KEY,
                     task_id TEXT NOT NULL REFERENCES tasks(id),
                     work_date TEXT NOT NULL,
                     start_minute INTEGER NOT NULL,
                     end_minute INTEGER NOT NULL,
                     duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
                     note TEXT
                 );",
            )?;
        }
        c.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_entries_date ON time_entries(work_date);
             CREATE INDEX IF NOT EXISTS idx_entries_task_date ON time_entries(task_id, work_date);",
        )?;
        let tx = c.transaction()?;
        tx.execute(
            "UPDATE tasks
             SET job_id = (
                 SELECT keeper.id
                 FROM jobs duplicate
                 JOIN jobs keeper
                   ON keeper.archived = 0
                  AND lower(trim(keeper.name)) = lower(trim(duplicate.name))
                  AND keeper.rowid < duplicate.rowid
                 WHERE duplicate.id = tasks.job_id AND duplicate.archived = 0
                 ORDER BY keeper.rowid
                 LIMIT 1
             )
             WHERE EXISTS (
                 SELECT 1
                 FROM jobs duplicate
                 JOIN jobs keeper
                   ON keeper.archived = 0
                  AND lower(trim(keeper.name)) = lower(trim(duplicate.name))
                  AND keeper.rowid < duplicate.rowid
                 WHERE duplicate.id = tasks.job_id AND duplicate.archived = 0
             )",
            [],
        )?;
        tx.execute(
            "UPDATE jobs AS duplicate
             SET archived = 1
             WHERE duplicate.archived = 0
               AND EXISTS (
                   SELECT 1 FROM jobs keeper
                   WHERE keeper.archived = 0
                     AND lower(trim(keeper.name)) = lower(trim(duplicate.name))
                     AND keeper.rowid < duplicate.rowid
               )",
            [],
        )?;
        let current_job: Option<String> = tx
            .query_row(
                "SELECT id FROM jobs WHERE archived = 0 ORDER BY rowid DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(current_job) = current_job {
            tx.execute(
                "UPDATE tasks SET job_id = ?1
                 WHERE job_id IN (
                     SELECT id FROM jobs WHERE archived = 0 AND id <> ?1
                 )",
                [&current_job],
            )?;
            tx.execute(
                "UPDATE jobs SET archived = 1 WHERE archived = 0 AND id <> ?1",
                [&current_job],
            )?;
        }
        tx.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_active_name
             ON jobs(lower(trim(name))) WHERE archived = 0",
            [],
        )?;
        tx.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_job
             ON jobs(archived) WHERE archived = 0",
            [],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn clear_all_data(&self) -> AppResult<()> {
        let mut connection = self.conn()?;
        connection.execute_batch("PRAGMA secure_delete = ON;")?;
        let tx = connection.transaction()?;
        tx.execute("DELETE FROM scheduled_items", [])?;
        tx.execute("DELETE FROM time_entries", [])?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM jobs", [])?;
        tx.execute("DELETE FROM profile", [])?;
        tx.commit()?;
        connection.execute_batch(
            "PRAGMA wal_checkpoint(TRUNCATE);
             VACUUM;
             PRAGMA wal_checkpoint(TRUNCATE);",
        )?;
        Ok(())
    }

    // Shared by weekly_timesheet, statistics, and export.
    pub(super) fn entries(&self, start: &str, end: &str) -> AppResult<Vec<TimeEntry>> {
        let start_iso = validation::date(start)
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|_| start.to_string());
        let end_iso = validation::date(end)
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|_| end.to_string());

        let c = self.conn()?;
        let mut s = c.prepare(
            "SELECT e.id, e.task_id, t.job_id, t.name, j.name, e.work_date,
                    e.start_minute, e.end_minute, e.duration_minutes, e.note
             FROM time_entries e
             JOIN tasks t ON t.id = e.task_id
             JOIN jobs  j ON j.id = t.job_id
             WHERE e.work_date BETWEEN ?1 AND ?2
             ORDER BY e.work_date, t.name",
        )?;
        let items = s
            .query_map(params![start_iso, end_iso], |r| {
                let raw_date: String = r.get(5)?;
                let work_date = validation::date(&raw_date)
                    .map(|d| validation::format_date(&d))
                    .unwrap_or(raw_date);
                Ok(TimeEntry {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    job_id: r.get(2)?,
                    task_name: r.get(3)?,
                    job_name: r.get(4)?,
                    work_date,
                    start_minute: r.get(6)?,
                    end_minute: r.get(7)?,
                    duration_minutes: r.get(8)?,
                    note: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn saves_a_weekly_entry_and_calculates_statistics() {
        let path = std::env::temp_dir().join(format!("alibi-{}.sqlite3", Uuid::new_v4()));
        let db = Database::open(&path).unwrap();
        db.migrate().unwrap();

        db.save_profile(&Profile {
            name: "Lohit".into(),
            company: None,
            workday_start: "09:00 AM".into(),
            workday_end: "05:00 PM".into(),
            timezone: "Asia/Kolkata".into(),
        })
        .unwrap();

        let job = db
            .save_job(&Job {
                id: String::new(),
                name: "Alibi".into(),
                archived: false,
            })
            .unwrap();

        let task = db
            .save_task(&Task {
                id: String::new(),
                job_id: job.id.clone(),
                name: "Backend".into(),
                archived: false,
            })
            .unwrap();

        db.save_weekly_timesheet(
            &job.id,
            "28-09-2026",
            &[TimeEntryInput {
                task_id: task.id,
                work_date: "29-09-2026".into(),
                start_minute: 540,
                end_minute: 630,
                note: Some("Database work".into()),
            }],
        )
        .unwrap();

        let daily = db.daily_statistics("29-09-2026").unwrap();
        assert_eq!(daily.worked_minutes, 90);
        assert_eq!(daily.expected_minutes, 480);
        assert_eq!(daily.formatted_worked_time, "1:30");
        assert_eq!(daily.date, "29-09-2026");

        let monthly = db.monthly_statistics(2026, 9).unwrap();
        assert_eq!(monthly.total_minutes, 90);

        let _ = fs::remove_file(path);
    }
}
