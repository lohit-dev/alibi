import { useEffect, useMemo, useState } from "react";
import { save as chooseSavePath } from "@tauri-apps/plugin-dialog";
import { exportProfile, getDailyStatistics, getPeriodStatistics } from "../lib/api";
import { asError, formatDate, formatDuration } from "../lib/utils";
import { useAppStore } from "../store/app";
import type { DailyStatistics, PeriodStatistics } from "../types";

type Scope = "day" | "week" | "month" | "six-months" | "year" | "custom";

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromInputDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
};

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
  const range = periodFor(scope, date, customStart, customEnd);
  const rangeStart = range?.start ?? "";
  const rangeEnd = range?.end ?? "";

  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
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
      const key = `${entry.job_id}:${entry.task_id}`;
      const item = totals.get(key) ?? {
        name: `${entry.job_name} · ${entry.task_name}`,
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
    const tasks = taskTotals.length
      ? taskTotals.map(
          (task) =>
            `- ${task.name}: ${formatDuration(task.minutes)} hours${totalMinutes ? ` (${((task.minutes / totalMinutes) * 100).toFixed(1)}%)` : ""}`
        )
      : ["- No time entries in this period."];
    const lines = [
      `# Alibi Work Summary — ${title}`,
      "",
      `Total tracked: ${formatDuration(totalMinutes)} hours`,
      `Active days: ${period?.active_days ?? 0}`,
      `Long focus blocks (45+ min): ${focusRate}%`,
      "",
      "Task breakdown:",
      ...tasks,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
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
        <div className="custom-range">
          <label>
            From{" "}
            <input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </label>
        </div>
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
              <p>Totals include all jobs and are grouped by task.</p>
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
        <button className="proof-secondary" onClick={() => void copyBrief()}>
          Copy appraisal brief
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
