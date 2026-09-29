import { useEffect, useMemo, useRef, useState } from "react";

type Edge = "start" | "end";

const parseDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const inputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDate(value));

export function DateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  const [activeEdge, setActiveEdge] = useState<Edge | null>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = parseDate(start);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const pickerRef = useRef<HTMLDivElement>(null);
  const today = inputDate(new Date());

  useEffect(() => {
    if (!activeEdge) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setActiveEdge(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveEdge(null);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeEdge]);

  const days = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  function open(edge: Edge) {
    if (activeEdge === edge) {
      setActiveEdge(null);
      return;
    }
    const selected = parseDate(edge === "start" ? start : end);
    setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setActiveEdge(edge);
  }

  function selectDate(date: Date) {
    const value = inputDate(date);
    if (activeEdge === "start") {
      onStartChange(value);
      if (value > end) onEndChange(value);
    } else if (activeEdge === "end") {
      onEndChange(value);
    }
    setActiveEdge(null);
  }

  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(viewMonth);

  return (
    <div className="date-range-picker" ref={pickerRef}>
      {(["start", "end"] as const).map((edge) => {
        const value = edge === "start" ? start : end;
        return (
          <div className="date-picker-field" key={edge}>
            <span className="date-picker-label">{edge === "start" ? "From" : "To"}</span>
            <button
              type="button"
              className="date-picker-trigger"
              aria-label={`${edge === "start" ? "Start" : "End"} date: ${dateLabel(value)}`}
              aria-haspopup="dialog"
              aria-expanded={activeEdge === edge}
              onClick={() => open(edge)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="2.5" y="4" width="15" height="13" rx="2" />
                <path d="M6 2.5v3M14 2.5v3M3 8h14" />
              </svg>
              <span>{dateLabel(value)}</span>
              <span className="date-picker-chevron" aria-hidden="true">
                ⌄
              </span>
            </button>
          </div>
        );
      })}

      {activeEdge && (
        <section
          className={`date-picker-popover ${activeEdge === "end" ? "is-end" : ""}`}
          role="dialog"
          aria-label={`Choose ${activeEdge === "start" ? "start" : "end"} date`}
          onKeyDown={(event) => {
            if (event.key === "Escape") setActiveEdge(null);
          }}
        >
          <header className="calendar-header">
            <h2>{monthLabel}</h2>
            <div className="calendar-controls">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setViewMonth(
                    (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1)
                  )
                }
              >
                ‹
              </button>
              <button
                type="button"
                className="calendar-today"
                onClick={() => {
                  const now = new Date();
                  setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                }}
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setViewMonth(
                    (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1)
                  )
                }
              >
                ›
              </button>
            </div>
          </header>
          <div className="calendar-weekdays" aria-hidden="true">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-days">
            {days.map((day) => {
              const value = inputDate(day);
              const isStart = value === start;
              const isEnd = value === end;
              const inRange = value > start && value < end;
              const disabled = activeEdge === "start" ? value > end : value < start;
              const className = [
                "calendar-day",
                day.getMonth() === viewMonth.getMonth() ? "" : "is-outside",
                value === today ? "is-today" : "",
                isStart ? "is-range-start" : "",
                isEnd ? "is-range-end" : "",
                inRange ? "is-in-range" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  type="button"
                  key={value}
                  className={className}
                  disabled={disabled}
                  aria-pressed={isStart || isEnd}
                  aria-label={new Intl.DateTimeFormat("en", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(day)}
                  onClick={() => selectDate(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <footer className="calendar-footer">
            <span>{activeEdge === "start" ? "Start date" : "End date"}</span>
            <strong>{dateLabel(activeEdge === "start" ? start : end)}</strong>
          </footer>
        </section>
      )}
    </div>
  );
}
