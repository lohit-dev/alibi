use crate::error::{AppError, AppResult};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use validator::Validate;

pub const DATE_FMT: &str = "%d-%m-%Y";
pub const TIME_FMT: &str = "%I:%M %p";
pub const TIMESTAMP_FMT: &str = "%d-%m-%Y %I:%M %p";

pub fn validate<T: Validate>(value: &T) -> AppResult<()> {
    value
        .validate()
        .map_err(|error| AppError::Validation(error.to_string()))
}

pub fn date(value: &str) -> AppResult<NaiveDate> {
    let trimmed = value.trim();
    NaiveDate::parse_from_str(trimmed, "%d-%m-%Y")
        .or_else(|_| NaiveDate::parse_from_str(trimmed, "%d/%m/%Y"))
        .or_else(|_| NaiveDate::parse_from_str(trimmed, "%Y-%m-%d"))
        .map_err(|_| AppError::Validation("date must use DD-MM-YYYY (e.g. 29-09-2026)".into()))
}

pub fn time(value: &str) -> AppResult<NaiveTime> {
    let trimmed = value.trim();
    NaiveTime::parse_from_str(trimmed, "%I:%M %p")
        .or_else(|_| NaiveTime::parse_from_str(trimmed, "%l:%M %p"))
        .or_else(|_| NaiveTime::parse_from_str(trimmed, "%I:%M%p"))
        .or_else(|_| NaiveTime::parse_from_str(trimmed, "%l:%M%p"))
        .or_else(|_| NaiveTime::parse_from_str(trimmed, "%H:%M"))
        .map_err(|_| {
            AppError::Validation("time must use 12-hour hh:mm AM/PM (e.g. 09:00 AM)".into())
        })
}

pub fn timestamp(value: &str) -> AppResult<NaiveDateTime> {
    let trimmed = value.trim();
    NaiveDateTime::parse_from_str(trimmed, "%d-%m-%Y %I:%M %p")
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%d-%m-%Y %l:%M %p"))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%d-%m-%YT%I:%M %p"))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%d-%m-%Y %H:%M:%S"))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%d-%m-%Y %H:%M"))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%d/%m/%Y %I:%M %p"))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S"))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M"))
        .or_else(|_| date(trimmed).map(|d| d.and_hms_opt(0, 0, 0).unwrap()))
        .map_err(|_| {
            AppError::Validation(
                "timestamp must use DD-MM-YYYY hh:mm AM/PM (e.g. 29-09-2026 09:00 AM)".into(),
            )
        })
}

pub fn format_date(d: &NaiveDate) -> String {
    d.format(DATE_FMT).to_string()
}

pub fn format_time(t: &NaiveTime) -> String {
    t.format(TIME_FMT).to_string()
}

pub fn format_timestamp(dt: &NaiveDateTime) -> String {
    dt.format(TIMESTAMP_FMT).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Timelike;

    #[test]
    fn parses_and_formats_dates_and_times() {
        let d = date("29-09-2026").unwrap();
        assert_eq!(format_date(&d), "29-09-2026");

        let t = time("09:00 AM").unwrap();
        assert_eq!(format_time(&t), "09:00 AM");

        let t2 = time("05:30 PM").unwrap();
        assert_eq!(format_time(&t2), "05:30 PM");

        let t_lower = time("05:30 pm").unwrap();
        assert_eq!(format_time(&t_lower), "05:30 PM");

        let midnight = time("12:00 AM").unwrap();
        assert_eq!(midnight.hour(), 0);

        let noon = time("12:00 PM").unwrap();
        assert_eq!(noon.hour(), 12);

        let ts = timestamp("29-09-2026 09:00 AM").unwrap();
        assert_eq!(format_timestamp(&ts), "29-09-2026 09:00 AM");

        assert!(date("invalid-date").is_err());
        assert!(time("invalid-time").is_err());
        assert!(time("25:00").is_err());
    }
}
