import { useEffect, useMemo, useState } from "react";
import { save as chooseSavePath } from "@tauri-apps/plugin-dialog";
import { exportProfile, getDailyStatistics, getPeriodStatistics } from "../lib/api";
import { asError, formatDate, formatDuration } from "../lib/utils";
import { useAppStore } from "../store/app";
import { DateRangePicker } from "./DateRangePicker";
import type { DailyStatistics, PeriodStatistics } from "../types";

type Scope = "day" | "week" | "month" | "six-months" | "year" | "custom";

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromInputDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
};

function formatEmailDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts = [
    hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "",
    remainingMinutes
      ? `${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`
      : "",
  ].filter(Boolean);
  return parts.join(" ") || "0 minutes";
}

function periodFor(scope: Scope, date: Date, customStart: string, customEnd: string) {
  const start = new Date(date);
  const end = new Date(date);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (scope === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (scope === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (scope === "six-months") {
    start.setDate(1);
    start.setMonth(start.getMonth() - 5);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (scope === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else if (scope === "custom") {
    if (!customStart || !customEnd) return null;
    return {
      start: fromInputDate(customStart),
      end: fromInputDate(customEnd),
      startInput: customStart,
      endInput: customEnd,
    };
  }

  return {
    start: formatDate(start),
    end: formatDate(end),
    startInput: toInputDate(start),
    endInput: toInputDate(end),
  };
}

export function AnalyticsView({ onBack }: { onBack: () => void }) {
  const date = useAppStore((state) => state.date);
  const profile = useAppStore((state) => state.profile);
  const [scope, setScope] = useState<Scope>("month");
  const [customStart, setCustomStart] = useState(() => {
    const start = new Date(date);
    start.setDate(1);
    return toInputDate(start);
  });
  const [customEnd, setCustomEnd] = useState(() => toInputDate(date));
  const [period, setPeriod] = useState<PeriodStatistics | null>(null);
  const [daily, setDaily] = useState<DailyStatistics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const range = periodFor(scope, date, customStart, customEnd);
  const rangeStart = range?.start ?? "";
  const rangeEnd = range?.end ?? "";

  useEffect(() => {
    if (!rangeStart || !rangeEnd) {
      setPeriod(null);
      setDaily(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const isSingleDay = rangeStart === rangeEnd;
    void Promise.all([
      getPeriodStatistics(rangeStart, rangeEnd),
      isSingleDay ? getDailyStatistics(rangeStart) : Promise.resolve(null),
    ])
      .then(([periodResult, dayResult]) => {
        if (!active) return;
        setPeriod(periodResult);
        setDaily(dayResult);
      })
      .catch((reason) => {
        if (active) setError(asError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rangeStart, rangeEnd]);

  const taskTotals = useMemo(() => {
    const totals = new Map<string, { name: string; minutes: number }>();
    for (const entry of period?.entries ?? []) {
      const key = entry.task_name.trim().toLocaleLowerCase();
      const item = totals.get(key) ?? {
        name: entry.task_name,
        minutes: 0,
      };
      item.minutes += entry.duration_minutes;
      totals.set(key, item);
    }
    return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  }, [period]);

  const totalMinutes = period?.total_minutes ?? 0;
  const focusMinutes = (period?.entries ?? [])
    .filter((entry) => entry.duration_minutes >= 45)
    .reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const focusRate = totalMinutes ? Math.round((focusMinutes / totalMinutes) * 100) : 0;
  const expectedMinutes = daily?.expected_minutes ?? 0;
  const coverage = expectedMinutes
    ? Math.round((totalMinutes / expectedMinutes) * 100)
    : null;
  const title = range ? `${range.start} — ${range.end}` : "Choose a valid date range";

  function formatEmailRange() {
    if (!range) return "the selected period";
    const format = (value: string) => {
      const [day, month, year] = value.split("-").map(Number);
      return new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(year, month - 1, day));
    };
    const [startDay, startMonth, startYear] = range.start.split("-").map(Number);
    const [endDay, endMonth, endYear] = range.end.split("-").map(Number);
    if (startDay === endDay && startMonth === endMonth && startYear === endYear) {
      return format(range.start);
    }
    if (startMonth === endMonth && startYear === endYear) {
      const monthAndYear = new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
      }).format(new Date(startYear, startMonth - 1, 1));
      return `${monthAndYear.split(" ")[0]} ${startDay}–${endDay}, ${startYear}`;
    }
    return `${format(range.start)} – ${format(range.end)}`;
  }

  async function handleExport() {
    setExporting(true);
    try {
      const path = await chooseSavePath({
        defaultPath: "alibi-evidence.json",
        filters: [{ name: "JSON backup", extensions: ["json"] }],
      });
      if (path) await exportProfile(path);
    } catch (reason) {
      setError(asError(reason));
    } finally {
      setExporting(false);
    }
  }

  async function copyBrief() {
    if (!range) {
      setError("Choose a valid date range before copying the email draft.");
      return;
    }
    const periodLabel = formatEmailRange();
    const taskLines = taskTotals.length
      ? taskTotals.map(
          (task) =>
            `• ${task.name} — ${formatEmailDuration(task.minutes)} (${((task.minutes / totalMinutes) * 100).toFixed(1)}%)`
        )
      : ["No time entries were recorded during this period."];
    const lines = [
      `Subject: Work summary for ${periodLabel}`,
      "",
      "Hi [Manager or HR name],",
      "",
      `I’m sharing a summary of my work for ${periodLabel}.`,
      "",
      `Time recorded: ${formatEmailDuration(totalMinutes)} across ${period?.active_days ?? 0} active ${(period?.active_days ?? 0) === 1 ? "day" : "days"}.`,
      `Focused work in continuous blocks of 45 minutes or longer: ${formatEmailDuration(focusMinutes)} (${focusRate}% of recorded time).`,
      "",
      "Work by task",
      ...taskLines,
      "",
      "This summary is based on the time entries in my work ledger.",
      "",
      "Best,",
      profile?.name?.trim() || "[Your name]",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      setError(asError(reason));
    }
  }

  return (
    <main className="analytics-shell">
      <header className="analytics-header">
        <div>
          <p className="eyebrow">ALIBI · APPRAISAL EVIDENCE</p>
          <h1>Work analytics</h1>
          <p className="analytics-period">{title}</p>
        </div>
        <button className="analytics-back" onClick={onBack}>
          ← Back to timeline
        </button>
      </header>
      <nav className="analytics-scopes" aria-label="Analytics period">
        {(["day", "week", "month", "six-months", "year", "custom"] as Scope[]).map(
          (value) => (
            <button
              key={value}
              className={scope === value ? "is-active" : ""}
              onClick={() => setScope(value)}
            >
              {value === "six-months"
                ? "6 Months"
                : value === "custom"
                  ? "Custom"
                  : value[0].toUpperCase() + value.slice(1)}
            </button>
          )
        )}
        <span>Calculated from the local ledger</span>
      </nav>
      {scope === "custom" && (
        <DateRangePicker
          start={customStart}
          end={customEnd}
          onStartChange={setCustomStart}
          onEndChange={setCustomEnd}
        />
      )}
      {loading ? (
        <p className="analytics-empty">Reading local ledger…</p>
      ) : (
        <>
          <section className="analytics-metrics">
            <article>
              <span>Total time invested</span>
              <strong className="font-mono">{formatDuration(totalMinutes)} h</strong>
              <small>
                {range
                  ? `${range.start} through ${range.end}`
                  : "Select a reporting range"}
              </small>
            </article>
            <article>
              <span>Deep work estimate</span>
              <strong className="font-mono">{focusRate}%</strong>
              <small>
                {formatDuration(focusMinutes)} in continuous blocks of 45+ minutes
              </small>
            </article>
            <article>
              <span>Logged days</span>
              <strong className="font-mono">{period?.active_days ?? 0}</strong>
              <small>
                {coverage === null
                  ? "Days with saved entries"
                  : `${coverage}% of one configured shift target`}
              </small>
            </article>
          </section>
          <section className="analytics-breakdown">
            <div className="breakdown-heading">
              <h2>Effort distribution across tasks</h2>
              <p>Time entries are grouped by task for the selected period.</p>
            </div>
            {taskTotals.length ? (
              taskTotals.map((item, index) => (
                <div className="analytics-task" key={item.name}>
                  <span
                    className="task-swatch"
                    style={{
                      backgroundColor: [
                        "var(--accent)",
                        "var(--secondary)",
                        "var(--tertiary)",
                        "var(--surface-container-high)",
                      ][index % 4],
                    }}
                  />
                  <strong>{item.name}</strong>
                  <span className="font-mono">
                    {formatDuration(item.minutes)} h ·{" "}
                    {totalMinutes
                      ? ((item.minutes / totalMinutes) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </span>
                  <div className="analytics-track">
                    <span
                      style={{
                        width: `${totalMinutes ? (item.minutes / totalMinutes) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="analytics-empty">No time entries in this period.</p>
            )}
          </section>
        </>
      )}
      {error && (
        <p className="analytics-error" role="alert">
          {error}
        </p>
      )}
      <footer className="analytics-actions">
        <button
          className="proof-secondary"
          disabled={loading || !range}
          onClick={() => void copyBrief()}
        >
          {copied ? "Email draft copied" : "Copy email draft"}
        </button>
        <button
          className="proof-primary"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? "Preparing export…" : "Export full JSON evidence"}
        </button>
      </footer>
    </main>
  );
}
