use super::Database;
use crate::{
    error::AppResult,
    models::{Job, Task},
    validation,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl Database {
    pub fn jobs(&self) -> AppResult<Vec<Job>> {
        let c = self.conn()?;
        let mut s =
            c.prepare("SELECT id, name, archived FROM jobs WHERE archived = 0 ORDER BY name")?;
        let items = s
            .query_map([], |r| {
                Ok(Job {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    archived: r.get::<_, i64>(2)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn save_job(&self, j: &Job) -> AppResult<Job> {
        validation::validate(j)?;
        if j.name.trim().is_empty() {
            return Err(crate::error::AppError::Validation(
                "job name cannot be blank".into(),
            ));
        }
        let c = self.conn()?;
        if j.id.is_empty() {
            let existing = c
                .query_row(
                    "SELECT id, name FROM jobs
                     WHERE archived = 0 AND lower(trim(name)) = lower(trim(?1))
                     ORDER BY rowid LIMIT 1",
                    [j.name.trim()],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?;
            if let Some((id, name)) = existing {
                return Ok(Job {
                    id,
                    name,
                    archived: false,
                });
            }
        }
        let id = if j.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            j.id.clone()
        };
        c.execute(
            "INSERT INTO jobs (id, name, archived) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
                 name     = excluded.name,
                 archived = excluded.archived",
            params![id, j.name.trim(), j.archived as i32],
        )?;
        Ok(Job { id, ..j.clone() })
    }

    pub fn archive_job(&self, id: &str) -> AppResult<()> {
        let c = self.conn()?;
        // unchecked_transaction because conn() gives a shared &Connection.
        // Safe here: both updates are independent and can't deadlock.
        let tx = c.unchecked_transaction()?;
        tx.execute("UPDATE jobs  SET archived = 1 WHERE id     = ?1", [id])?;
        tx.execute("UPDATE tasks SET archived = 1 WHERE job_id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn tasks(&self, job: Option<&str>) -> AppResult<Vec<Task>> {
        let c = self.conn()?;
        let mut s = c.prepare(
            "SELECT id, job_id, name, archived FROM tasks
             WHERE archived = 0 AND (?1 IS NULL OR job_id = ?1)
             ORDER BY name",
        )?;
        let items = s
            .query_map([job], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    job_id: r.get(1)?,
                    name: r.get(2)?,
                    archived: r.get::<_, i64>(3)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn save_task(&self, t: &Task) -> AppResult<Task> {
        validation::validate(t)?;
        if t.name.trim().is_empty() {
            return Err(crate::error::AppError::Validation(
                "task name cannot be blank".into(),
            ));
        }
        let id = if t.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            t.id.clone()
        };
        self.conn()?.execute(
            "INSERT INTO tasks (id, job_id, name, archived) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                 job_id   = excluded.job_id,
                 name     = excluded.name,
                 archived = excluded.archived",
            params![id, t.job_id, t.name.trim(), t.archived as i32],
        )?;
        Ok(Task { id, ..t.clone() })
    }

    pub fn archive_task(&self, id: &str) -> AppResult<()> {
        self.conn()?
            .execute("UPDATE tasks SET archived = 1 WHERE id = ?1", [id])?;
        Ok(())
    }
}
