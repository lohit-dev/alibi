use super::Database;
use crate::{
    error::AppResult,
    models::{ScheduledItem, ScheduledItemInput},
    validation,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl Database {
    pub fn scheduled_items(&self, from: &str, to: Option<&str>) -> AppResult<Vec<ScheduledItem>> {
        let from_iso = validation::timestamp(from)
            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
            .unwrap_or_else(|_| from.to_string());
        let to_iso = to.map(|t| {
            validation::timestamp(t)
                .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
                .unwrap_or_else(|_| t.to_string())
        });

        let c = self.conn()?;
        let mut s = c.prepare(
            "SELECT id, title, kind, scheduled_at, duration_minutes, task_id, completed
             FROM scheduled_items
             WHERE scheduled_at >= ?1 AND (?2 IS NULL OR scheduled_at <= ?2)
             ORDER BY scheduled_at",
        )?;
        let items = s
            .query_map(params![from_iso, to_iso], |r| {
                let raw_at: String = r.get(3)?;
                let scheduled_at = validation::timestamp(&raw_at)
                    .map(|dt| validation::format_timestamp(&dt))
                    .unwrap_or(raw_at);
                Ok(ScheduledItem {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    kind: r.get(2)?,
                    scheduled_at,
                    duration_minutes: r.get(4)?,
                    task_id: r.get(5)?,
                    completed: r.get::<_, i64>(6)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn save_scheduled_item(&self, i: &ScheduledItemInput) -> AppResult<ScheduledItem> {
        validation::validate(i)?;
        if i.title.trim().is_empty() || i.kind.trim().is_empty() {
            return Err(crate::error::AppError::Validation(
                "title and kind cannot be blank".into(),
            ));
        }
        let dt = validation::timestamp(&i.scheduled_at)?;
        let iso_at = dt.format("%Y-%m-%dT%H:%M:%S").to_string();
        let formatted_at = validation::format_timestamp(&dt);
        let id = i.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let completed = self
            .conn()?
            .query_row(
                "SELECT completed FROM scheduled_items WHERE id = ?1",
                [&id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .unwrap_or(0)
            != 0;
        self.conn()?.execute(
            "INSERT INTO scheduled_items
                 (id, title, kind, scheduled_at, duration_minutes, task_id, completed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)
             ON CONFLICT(id) DO UPDATE SET
                 title            = excluded.title,
                 kind             = excluded.kind,
                 scheduled_at     = excluded.scheduled_at,
                 duration_minutes = excluded.duration_minutes,
                 task_id          = excluded.task_id",
            params![
                id,
                i.title.trim(),
                i.kind.trim(),
                iso_at,
                i.duration_minutes,
                i.task_id
            ],
        )?;
        Ok(ScheduledItem {
            id,
            title: i.title.clone(),
            kind: i.kind.clone(),
            scheduled_at: formatted_at,
            duration_minutes: i.duration_minutes,
            task_id: i.task_id.clone(),
            completed,
        })
    }

    pub fn complete_scheduled_item(&self, id: &str, completed: bool) -> AppResult<()> {
        self.conn()?.execute(
            "UPDATE scheduled_items SET completed = ?2 WHERE id = ?1",
            params![id, completed as i32],
        )?;
        Ok(())
    }
}
