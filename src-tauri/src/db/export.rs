use super::Database;
use crate::{
    error::{AppError, AppResult},
    models::{ExportBundle, Job, Task},
    validation,
};
use rusqlite::{params, OptionalExtension};
use std::{collections::HashSet, fs, path::Path};

impl Database {
    pub fn export(&self, path: &Path) -> AppResult<()> {
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            return Err(AppError::Validation("exports must use a .json file".into()));
        }
        fs::write(path, serde_json::to_vec_pretty(&self.all()?)?)?;
        Ok(())
    }

    pub fn import(&self, path: &Path) -> AppResult<()> {
        if fs::metadata(path)?.len() > 10_000_000 {
            return Err(AppError::Validation(
                "import file is larger than 10 MB".into(),
            ));
        }
        let b: ExportBundle = serde_json::from_slice(&fs::read(path)?)?;
        if b.schema_version != 1 {
            return Err(AppError::Validation("unsupported backup version".into()));
        }

        let mut c = self.conn()?;
        let tx = c.transaction()?;
        let existing_active_job: Option<String> = tx
            .query_row(
                "SELECT id FROM jobs WHERE archived = 0 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let incoming_active_jobs: HashSet<String> = b
            .jobs
            .iter()
            .filter(|job| !job.archived)
            .map(|job| job.id.clone())
            .collect();
        let canonical_active_job = existing_active_job.or_else(|| {
            b.jobs
                .iter()
                .rev()
                .find(|job| !job.archived)
                .map(|job| job.id.clone())
        });

        if let Some(p) = b.profile {
            let start = validation::time(&p.workday_start)
                .map(|t| validation::format_time(&t))
                .unwrap_or(p.workday_start);
            let end = validation::time(&p.workday_end)
                .map(|t| validation::format_time(&t))
                .unwrap_or(p.workday_end);
            tx.execute(
                "INSERT INTO profile (id, name, company, workday_start, workday_end, timezone)
                 VALUES ('default', ?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                     name          = excluded.name,
                     company       = excluded.company,
                     workday_start = excluded.workday_start,
                     workday_end   = excluded.workday_end,
                     timezone      = excluded.timezone",
                params![p.name, p.company, start, end, p.timezone],
            )?;
        }

        for mut j in b.jobs {
            if canonical_active_job.as_deref() == Some(j.id.as_str()) {
                j.archived = false;
            } else if !j.archived && canonical_active_job.is_some() {
                j.archived = true;
            }
            tx.execute(
                "INSERT INTO jobs (id, name, archived)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET
                     name     = excluded.name,
                     archived = excluded.archived",
                params![j.id, j.name, j.archived as i32],
            )?;
        }

        for t in b.tasks {
            let job_id = if incoming_active_jobs.contains(&t.job_id) {
                canonical_active_job.as_deref().unwrap_or(&t.job_id)
            } else {
                &t.job_id
            };
            tx.execute(
                "INSERT INTO tasks (id, job_id, name, archived)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET
                     job_id   = excluded.job_id,
                     name     = excluded.name,
                     archived = excluded.archived",
                params![t.id, job_id, t.name, t.archived as i32],
            )?;
        }

        for e in b.time_entries {
            let d = validation::date(&e.work_date)?;
            let iso_date = d.format("%Y-%m-%d").to_string();
            let (start_minute, end_minute) = if e.end_minute > e.start_minute {
                (e.start_minute, e.end_minute)
            } else {
                (480, 480 + e.duration_minutes)
            };
            tx.execute(
                "INSERT INTO time_entries (id, task_id, work_date, start_minute, end_minute, duration_minutes, note)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                     task_id          = excluded.task_id,
                     work_date        = excluded.work_date,
                     start_minute     = excluded.start_minute,
                     end_minute       = excluded.end_minute,
                     duration_minutes = excluded.duration_minutes,
                     note             = excluded.note",
                params![e.id, e.task_id, iso_date, start_minute, end_minute, end_minute - start_minute, e.note],
            )?;
        }

        for i in b.scheduled_items {
            let iso_at = validation::timestamp(&i.scheduled_at)
                .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
                .unwrap_or(i.scheduled_at);
            tx.execute(
                "INSERT INTO scheduled_items
                     (id, title, kind, scheduled_at, duration_minutes, task_id, completed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                     title            = excluded.title,
                     kind             = excluded.kind,
                     scheduled_at     = excluded.scheduled_at,
                     duration_minutes = excluded.duration_minutes,
                     task_id          = excluded.task_id,
                     completed        = excluded.completed",
                params![
                    i.id,
                    i.title,
                    i.kind,
                    iso_at,
                    i.duration_minutes,
                    i.task_id,
                    i.completed as i32,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    fn all(&self) -> AppResult<ExportBundle> {
        let profile = self.profile()?;

        let jobs = {
            let c = self.conn()?;
            let mut s = c.prepare("SELECT id, name, archived FROM jobs")?;
            let items = s
                .query_map([], |r| {
                    Ok(Job {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        archived: r.get::<_, i64>(2)? != 0,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            items
        };

        let tasks = {
            let c = self.conn()?;
            let mut s = c.prepare("SELECT id, job_id, name, archived FROM tasks")?;
            let items = s
                .query_map([], |r| {
                    Ok(Task {
                        id: r.get(0)?,
                        job_id: r.get(1)?,
                        name: r.get(2)?,
                        archived: r.get::<_, i64>(3)? != 0,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            items
        };

        let scheduled_items = self.scheduled_items("01-01-0000 12:00 AM", None)?;

        Ok(ExportBundle {
            schema_version: 1,
            profile,
            jobs,
            tasks,
            time_entries: self.entries("01-01-0000", "31-12-9999")?,
            scheduled_items,
        })
    }
}
