import { DEFAULT_START, DEFAULT_END, STEP } from "./constants";

export const snap = (
  minutes: number,
  start = DEFAULT_START,
  end = DEFAULT_END,
  step = STEP
) => Math.max(start, Math.min(end, Math.round(minutes / step) * step));

/**
 * Parses time strings into minutes from midnight.
 * Supports: "9", "9am", "9pm", "09:00 AM", "5:30 PM", "17:00", etc.
 */
export const parseTimeToMinutes = (
  timeStr?: string | null,
  fallbackMinutes = DEFAULT_START,
  isEnd = false
): number => {
  if (!timeStr) return fallbackMinutes;
  const raw = timeStr.trim().toLowerCase();

  // 12-hour format with or without colon/minutes (e.g. "9am", "9:00am", "9 am", "09:00 pm")
  const match12 = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const period = match12[3].toLowerCase();
    if (period === "am") {
      if (hours === 12) hours = 0;
    } else {
      if (hours !== 12) hours += 12;
    }
    return hours * 60 + minutes;
  }

  // 24-hour format with minutes (e.g. "17:00", "09:30")
  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }

  // Pure integer hour (e.g. "9", "17", "21")
  const matchNum = raw.match(/^(\d{1,2})$/);
  if (matchNum) {
    let hours = parseInt(matchNum[1], 10);
    // If it's an end time between 1 and 11, assume afternoon/evening (e.g. 9 -> 9 PM)
    if (isEnd && hours >= 1 && hours <= 11) {
      hours += 12;
    }
    return hours * 60;
  }

  return fallbackMinutes;
};

export const parseTimeInput = (value: string, isEnd = false): number | null => {
  const raw = value.trim().toLowerCase();
  const twelveHour = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return ((hour % 12) + (twelveHour[3] === "pm" ? 12 : 0)) * 60 + minute;
  }

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  if (/^\d{1,2}$/.test(raw)) {
    let hour = Number(raw);
    if (hour > 23) return null;
    if (isEnd && hour >= 1 && hour <= 11) hour += 12;
    return hour * 60;
  }
  return null;
};

export const formatHourLabel = (hour24: number): string => {
  const normalized = ((hour24 % 24) + 24) % 24;
  const hour12 = ((((normalized - 1) % 12) + 12) % 12) + 1;
  const period = normalized < 12 ? "AM" : "PM";
  return `${hour12} ${period}`;
};

export const formatDuration = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

// DD-MM-YYYY — matches backend validation format (%d-%m-%Y)
export const formatDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;

// Strict Day Month Year format (e.g. "Tue, 29 September 2026")
export const displayDate = (date: Date) => {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const year = date.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
};

// 12-hour hh:mm AM/PM format (e.g. "09:00 AM", "05:30 PM")
export const formatTime12h = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const hour12 = ((((hours - 1) % 12) + 12) % 12) + 1;
  const period = hours < 12 ? "AM" : "PM";
  return `${String(hour12).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`;
};

export const asError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
