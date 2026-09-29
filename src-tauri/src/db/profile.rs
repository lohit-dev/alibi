use super::Database;
use crate::{error::AppResult, models::Profile, validation};
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn profile(&self) -> AppResult<Option<Profile>> {
        let prof = self
            .conn()?
            .query_row(
                "SELECT name, company, workday_start, workday_end, timezone
                 FROM profile
                 WHERE id = 'default'",
                [],
                |r| {
                    let start_raw: String = r.get(2)?;
                    let end_raw: String = r.get(3)?;
                    let workday_start = validation::time(&start_raw)
                        .map(|t| validation::format_time(&t))
                        .unwrap_or(start_raw);
                    let workday_end = validation::time(&end_raw)
                        .map(|t| validation::format_time(&t))
                        .unwrap_or(end_raw);
                    Ok(Profile {
                        name: r.get(0)?,
                        company: r.get(1)?,
                        workday_start,
                        workday_end,
                        timezone: r.get(4)?,
                    })
                },
            )
            .optional()?;
        Ok(prof)
    }

    pub fn save_profile(&self, p: &Profile) -> AppResult<()> {
        validation::validate(p)?;
        if p.name.trim().is_empty() || p.timezone.trim().is_empty() {
            return Err(crate::error::AppError::Validation(
                "name and timezone cannot be blank".into(),
            ));
        }
        let start = validation::time(&p.workday_start)?;
        let end = validation::time(&p.workday_end)?;
        let start_str = validation::format_time(&start);
        let end_str = validation::format_time(&end);
        self.conn()?.execute(
            "INSERT INTO profile (id, name, company, workday_start, workday_end, timezone)
             VALUES ('default', ?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                 name          = excluded.name,
                 company       = excluded.company,
                 workday_start = excluded.workday_start,
                 workday_end   = excluded.workday_end,
                 timezone      = excluded.timezone",
            params![p.name.trim(), p.company, start_str, end_str, p.timezone],
        )?;
        Ok(())
    }

    pub fn expected_minutes(&self) -> AppResult<i64> {
        let Some(p) = self.profile()? else {
            return Ok(0);
        };
        Ok(
            (validation::time(&p.workday_end)? - validation::time(&p.workday_start)?)
                .num_minutes()
                .max(0),
        )
    }
}
