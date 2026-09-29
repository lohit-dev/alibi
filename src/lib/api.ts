import { invoke } from "@tauri-apps/api/core";
import type {
  Job,
  Task,
  Segment,
  SegmentInput,
  Profile,
  WeeklyTimesheet,
  ScheduledItem,
  ScheduledItemInput,
  DashboardWidget,
  DailyStatistics,
  MonthlyStatistics,
  PeriodStatistics,
  EndOfDayStatus,
} from "../types";

// ── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = () => invoke<Profile | null>("get_profile");

export const saveProfile = (profile: Profile) =>
  invoke<void>("save_profile", { profile });

export const clearAllData = () => invoke<void>("clear_all_data");

// ── Jobs ─────────────────────────────────────────────────────────────────────

export const listJobs = () => invoke<Job[]>("list_jobs");

export const saveJob = (job: Job) => invoke<Job>("save_job", { job });

export const archiveJob = (jobId: string) => invoke<void>("archive_job", { jobId });

// ── Tasks ────────────────────────────────────────────────────────────────────

export const listTasks = (jobId?: string) => invoke<Task[]>("list_tasks", { jobId });

export const saveTask = (task: Task) => invoke<Task>("save_task", { task });

export const archiveTask = (taskId: string) => invoke<void>("archive_task", { taskId });

// ── Day Entries ──────────────────────────────────────────────────────────────

export const getDayEntries = (jobId: string, date: string) =>
  invoke<Segment[]>("get_day_entries", { jobId, date });

export const saveDayEntries = (jobId: string, date: string, entries: SegmentInput[]) =>
  invoke<void>("save_day_entries", { jobId, date, entries });

// ── Weekly Timesheet ─────────────────────────────────────────────────────────

export const getWeeklyTimesheet = (jobId: string, weekStart: string) =>
  invoke<WeeklyTimesheet>("get_weekly_timesheet", { jobId, weekStart });

export const saveWeeklyTimesheet = (timesheet: WeeklyTimesheet) =>
  invoke<void>("save_weekly_timesheet", { timesheet });

// ── Schedule Items ───────────────────────────────────────────────────────────

export const listScheduledItems = (includeCompleted = false) =>
  invoke<ScheduledItem[]>("list_scheduled_items", { includeCompleted });

export const saveScheduledItem = (item: ScheduledItemInput) =>
  invoke<ScheduledItem>("save_scheduled_item", { item });

export const completeScheduledItem = (itemId: string, completed = true) =>
  invoke<void>("complete_scheduled_item", { itemId, completed });

// ── Dashboard & Statistics ───────────────────────────────────────────────────

export const getDashboardWidget = (date?: string) =>
  invoke<DashboardWidget>("get_dashboard_widget", { date });

export const getDailyStatistics = (date?: string) =>
  invoke<DailyStatistics>("get_daily_statistics", { date });

export const getMonthlyStatistics = (year?: number, month?: number) =>
  invoke<MonthlyStatistics>("get_monthly_statistics", { year, month });

export const getPeriodStatistics = (startDate: string, endDate: string) =>
  invoke<PeriodStatistics>("get_period_statistics", { startDate, endDate });

export const getEndOfDayStatus = (date?: string) =>
  invoke<EndOfDayStatus>("get_end_of_day_status", { date });

// ── Export / Import ──────────────────────────────────────────────────────────

export const exportProfile = (path: string) => invoke<void>("export_profile", { path });

export const importProfile = (path: string) => invoke<void>("import_profile", { path });
