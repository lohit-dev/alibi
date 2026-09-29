import { useEffect, useMemo, useState } from "react";
import { getDailyStatistics } from "../lib/api";
import { asError, formatDuration } from "../lib/utils";
import type { DailyStatistics } from "../types";

const colors = [
  "var(--accent)",
  "var(--secondary)",
  "var(--tertiary)",
  "var(--surface-container-high)",
  "var(--accent-container)",
];

export function DailySummaryModal({
  date,
  onClose,
  onAnalytics,
}: {
  date: string;
  onClose: () => void;
  onAnalytics: () => void;
}) {
  const [stats, setStats] = useState<DailyStatistics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getDailyStatistics(date)
      .then((result) => {
        if (active) setStats(result);
      })
      .catch((reason) => {
        if (active) setError(asError(reason));
      });
    return () => {
      active = false;
    };
  }, [date]);

  const distribution = useMemo(() => {
    if (!stats) return [];
    const totals = new Map<string, { name: string; minutes: number }>();
    for (const entry of stats.entries) {
      const key = `${entry.job_id}:${entry.task_id}`;
      const item = totals.get(key) ?? {
        name: `${entry.job_name} · ${entry.task_name}`,
        minutes: 0,
      };
      item.minutes += entry.duration_minutes;
      totals.set(key, item);
    }
    return [...totals.values()]
      .map((item, index) => ({ ...item, color: colors[index % colors.length] }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [stats]);

  if (!stats)
    return (
      <div className="proof-backdrop" role="dialog" aria-modal="true">
        <section className="proof-panel">
          <button className="proof-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          {error || "Preparing daily proof…"}
        </section>
      </div>
    );

  const total = stats.worked_minutes;
  const deepWork = stats.entries
    .filter((entry) => entry.duration_minutes >= 45)
    .reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const fulfillment = stats.expected_minutes
    ? Math.round((total / stats.expected_minutes) * 100)
    : 0;
  const focusRate = total ? Math.round((deepWork / total) * 100) : 0;
  let offset = 0;

  const [day, month, year] = date.split("-").map(Number);
  const readableDate = new Date(year, month - 1, day).toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="proof-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="proof-panel">
        <header className="proof-heading">
          <h2 id="proof-title">
            Daily Performance Summary <span>· {readableDate}</span>
          </h2>
          <button className="proof-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="proof-overview">
          <div className="proof-ring-wrap">
            <svg
              className="proof-ring"
              viewBox="0 0 120 120"
              role="img"
              aria-label="Time distribution by task"
            >
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="var(--rule)"
                strokeWidth="14"
              />
              {distribution.map((item) => {
                const dash = total ? (item.minutes / total) * 289 : 0;
                const circle = (
                  <circle
                    key={item.name}
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke={item.color}
                    strokeWidth="14"
                    strokeDasharray={`${dash} ${289 - dash}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 60 60)"
                  />
                );
                offset += dash;
                return circle;
              })}
              <text x="60" y="57" textAnchor="middle" className="ring-value">
                {formatDuration(total)}
              </text>
              <text x="60" y="73" textAnchor="middle" className="ring-caption">
                tracked
              </text>
            </svg>
            <span className="proof-ring-label">Task distribution</span>
          </div>
          <div className="proof-metrics">
            <article>
              <span>Total tracked today</span>
              <strong>{formatDuration(total)} Hours</strong>
              <small>{stats.has_data ? "Verified entries" : "No entries recorded"}</small>
            </article>
            <article>
              <span>Shift target</span>
              <strong>{formatDuration(stats.expected_minutes)} Hours</strong>
              <small>{fulfillment}% fulfilled</small>
            </article>
            <article>
              <span>Deep work ratio</span>
              <strong>{focusRate}%</strong>
              <small>{formatDuration(deepWork)} in blocks of 45+ minutes</small>
            </article>
          </div>
        </div>
        <h3 className="proof-subtitle">Tasks logged today</h3>
        {distribution.length === 0 ? (
          <p className="proof-empty">No time entries for this date.</p>
        ) : (
          <div className="proof-list">
            {distribution.map((item) => (
              <div className="proof-row" key={item.name}>
                <span className="proof-color" style={{ backgroundColor: item.color }} />
                <strong>{item.name}</strong>
                <span>{formatDuration(item.minutes)} Hours</span>
                <span className="proof-percent">
                  {total ? ((item.minutes / total) * 100).toFixed(1) : "0.0"}%
                </span>
                <div className="proof-progress">
                  <span
                    style={{
                      width: `${total ? (item.minutes / total) * 100 : 0}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <footer className="proof-actions">
          <button className="proof-secondary" onClick={onClose}>
            Close
          </button>
          <button className="proof-primary" onClick={onAnalytics}>
            View analytics
          </button>
        </footer>
      </section>
    </div>
  );
}
