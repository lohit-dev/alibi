export type Job = {
  id: string;
  name: string;
  archived: boolean;
};

export type Task = {
  id: string;
  job_id: string;
  name: string;
  archived: boolean;
};

export type Segment = {
  id: string;
  task_id: string;
  job_id: string;
  task_name: string;
  job_name: string;
  work_date: string;
  start_minute: number;
  end_minute: number;
  duration_minutes: number;
  note?: string | null;
};

export type TimeEntry = Segment;

export type SegmentInput = {
  task_id: string;
  work_date: string;
  start_minute: number;
  end_minute: number;
  note?: string | null;
};

export type TimeEntryInput = SegmentInput;

export type Profile = {
  name: string;
  company: string | null;
  workday_start: string;
  workday_end: string;
  timezone: string;
};

export type WeekCell = {
  work_date: string;
  duration_minutes: number;
  note?: string | null;
  segments: Segment[];
};

export type TaskWeekRow = {
  task: Task;
  cells: WeekCell[];
  total_minutes: number;
};

export type WeeklyTimesheet = {
  job_id: string;
  week_start: string;
  days: string[];
  tasks: TaskWeekRow[];
  daily_totals_minutes: number[];
  total_minutes: number;
};

export type ScheduledItem = {
  id: string;
  title: string;
  kind: string;
  scheduled_at: string;
  duration_minutes?: number | null;
  task_id?: string | null;
  completed: boolean;
};

export type ScheduledItemInput = {
  id?: string | null;
  title: string;
  kind: string;
  scheduled_at: string;
  duration_minutes?: number | null;
  task_id?: string | null;
};

export type DailyStatistics = {
  date: string;
  worked_minutes: number;
  formatted_worked_time: string;
  expected_minutes: number;
  has_data: boolean;
  entries: Segment[];
};

export type MonthlyStatistics = {
  year: number;
  month: number;
  total_minutes: number;
  formatted_total_time: string;
  working_days_with_entries: number;
};

export type PeriodStatistics = {
  start_date: string;
  end_date: string;
  total_minutes: number;
  active_days: number;
  entries: Segment[];
};

export type EndOfDayStatus = {
  date: string;
  is_workday_finished: boolean;
  expected_minutes: number;
  has_data: boolean;
  logged_minutes: number;
  formatted_logged_time: string;
  entries: Segment[];
};

export type DashboardWidget = {
  date: string;
  worked_minutes: number;
  formatted_worked_time: string;
  expected_minutes: number;
  has_data: boolean;
  completed_scheduled_items: number;
  open_scheduled_items: number;
  today_entries: Segment[];
  upcoming: ScheduledItem[];
};

export type ExportBundle = {
  schema_version: number;
  profile?: Profile | null;
  jobs: Job[];
  tasks: Task[];
  time_entries: Segment[];
  scheduled_items: ScheduledItem[];
};
