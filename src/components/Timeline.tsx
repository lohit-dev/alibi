import { useRef, useState, useEffect, type PointerEvent } from "react";
import { useAppStore } from "../store/app";
import { STEP } from "../lib/constants";
import { snap, formatDate, parseTimeToMinutes, formatHourLabel } from "../lib/utils";
import { TimelineRow, type TaskRow } from "./TimelineRow";
import type { Segment } from "../types";

type Gesture = {
  taskId: string;
  segmentId: string;
  mode: "draw" | "move" | "start" | "end";
  pointerX: number;
  original: Segment;
};

interface TimelineProps {
  onAddTask: () => void;
}

export function Timeline({ onAddTask }: TimelineProps) {
  const segments = useAppStore((s) => s.segments);
  const tasks = useAppStore((s) => s.tasks);
  const jobId = useAppStore((s) => s.jobId);
  const date = useAppStore((s) => s.date);
  const setDate = useAppStore((s) => s.setDate);
  const profile = useAppStore((s) => s.profile);
  const setSegments = useAppStore((s) => s.setSegments);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const saveDay = useAppStore((s) => s.saveDay);
  const saving = useAppStore((s) => s.saving);

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);

  // Derive timeline window dynamically from profile workday_start & workday_end
  // E.g. start at 9 and end at 9 -> start 9 AM (9), end 9 PM (21), displaying 9 AM through 9 PM inclusive!
  const startMinutes = parseTimeToMinutes(profile?.workday_start, 8 * 60, false);
  const endMinutes = parseTimeToMinutes(profile?.workday_end, 20 * 60, true);

  const startHour = Math.floor(startMinutes / 60);
  let endHour = Math.floor(endMinutes / 60);
  if (endHour <= startHour) {
    endHour = Math.min(23, startHour + 8);
  }

  // Display columns inclusive from startHour to endHour (e.g. 9 AM to 9 PM = 13 columns, ending with 9 PM!)
  const totalHours = endHour - startHour + 1;
  const timelineStart = startHour * 60;
  const timelineEnd = (endHour + 1) * 60;
  const span = timelineEnd - timelineStart;

  const hourLabels = Array.from({ length: totalHours }, (_, i) =>
    formatHourLabel(startHour + i)
  );

  const taskRows: TaskRow[] = tasks.map((task) => ({
    task,
    segments: segments
      .filter((s) => s.task_id === task.id)
      .sort((a, b) => a.start_minute - b.start_minute),
  }));

  const currentDate = formatDate(date);

  // Keyboard shortcut listener: Backspace to delete, Ctrl+Z / Cmd+Z to undo, Ctrl+Shift+Z / Cmd+Y to redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (useAppStore.getState().saving) return;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        Boolean(
          target.closest(
            "input, textarea, select, [role='dialog'], [contenteditable='true']"
          )
        );

      if (isInput) return;

      // Ctrl+Z / Cmd+Z to Undo, Ctrl+Shift+Z / Cmd+Y to Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        queueMicrotask(() => {
          if (useAppStore.getState().dirty) void saveDay();
        });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        queueMicrotask(() => {
          if (useAppStore.getState().dirty) void saveDay();
        });
        return;
      }

      // Backspace to delete selected block
      if (e.key === "Backspace") {
        if (selectedSegmentId) {
          e.preventDefault();
          pushHistory();
          setSegments((prev) => prev.filter((s) => s.id !== selectedSegmentId));
          setSelectedSegmentId(null);
          void saveDay();
        }
      } else if (e.key === "Delete") {
        if (selectedSegmentId) {
          e.preventDefault();
          pushHistory();
          setSegments((prev) => prev.filter((s) => s.id !== selectedSegmentId));
          setSelectedSegmentId(null);
          void saveDay();
        }
      } else if (e.key === "Escape") {
        setSelectedSegmentId(null);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = new Date(date);
        next.setDate(next.getDate() + (e.key === "ArrowLeft" ? -1 : 1));
        setDate(next);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSegmentId, setSegments, pushHistory, undo, redo, saveDay, date, setDate]);

  function pointerMinute(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return timelineStart + ((event.clientX - bounds.left) / bounds.width) * span;
  }

  function startGesture(event: PointerEvent<HTMLDivElement>, taskId: string) {
    if (useAppStore.getState().saving) return;
    const bar = (event.target as HTMLElement).closest<HTMLElement>(".bar");
    const px = pointerMinute(event);
    const existing = bar ? segments.find((s) => s.id === bar.dataset.id) : undefined;

    if (existing) {
      setSelectedSegmentId(existing.id);
    } else {
      setSelectedSegmentId(null);
    }

    const snappedStart = snap(px, timelineStart, timelineEnd, STEP);
    const original = existing ?? {
      id: crypto.randomUUID(),
      task_id: taskId,
      job_id: jobId,
      task_name: "",
      job_name: "",
      work_date: currentDate,
      start_minute: snappedStart,
      end_minute: Math.min(timelineEnd, snappedStart + 60),
      duration_minutes: Math.min(60, timelineEnd - snappedStart),
      note: null,
    };

    if (!bar) {
      pushHistory();
      setSegments((prev) => [...prev, original]);
      setSelectedSegmentId(original.id);
    } else {
      pushHistory();
    }

    const target = event.target as HTMLElement;
    gesture.current = {
      taskId,
      segmentId: original.id,
      mode: !bar
        ? "draw"
        : target.classList.contains("edge-end")
          ? "end"
          : target.classList.contains("edge-start")
            ? "start"
            : "move",
      pointerX: px,
      original,
    };

    event.currentTarget.setPointerCapture(event.pointerId);

    if (!bar) {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === original.id
            ? {
                ...s,
                start_minute: snappedStart,
                end_minute: Math.min(timelineEnd, snappedStart + 60),
              }
            : s
        )
      );
    }
  }

  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) return;
    const delta = pointerMinute(event) - active.pointerX;
    const { original } = active;

    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== active.segmentId) return s;
        let start = s.start_minute;
        let end = s.end_minute;

        if (active.mode === "draw" || active.mode === "end") {
          end = Math.max(
            start + STEP,
            snap(original.end_minute + delta, timelineStart, timelineEnd, STEP)
          );
        } else if (active.mode === "start") {
          start = Math.min(
            end - STEP,
            snap(original.start_minute + delta, timelineStart, timelineEnd, STEP)
          );
        } else {
          const len = original.end_minute - original.start_minute;
          start = Math.max(
            timelineStart,
            Math.min(
              timelineEnd - len,
              snap(original.start_minute + delta, timelineStart, timelineEnd, STEP)
            )
          );
          end = start + len;
        }

        end = Math.min(timelineEnd, end);
        start = Math.max(timelineStart, start);
        return {
          ...s,
          start_minute: start,
          end_minute: end,
          duration_minutes: end - start,
        };
      })
    );
  }

  function finishGesture() {
    gesture.current = null;
    if (useAppStore.getState().dirty) void saveDay();
  }

  return (
    <div
      className={`timeline-motion flex flex-col gap-2 ${saving ? "pointer-events-none opacity-70" : ""}`}
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[#ececec]">
        <div className="w-full min-w-0">
          {/* Header row with dynamic hours */}
          <div className="timeline-heading grid grid-cols-[minmax(140px,210px)_minmax(0,1fr)]">
            <div className="timeline-heading-cell flex items-center justify-between border-r border-[#ececec] px-3 py-2">
              Tasks
              <button
                type="button"
                className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#555] shadow-xs hover:bg-[#fafafa] cursor-pointer transition-colors"
                onClick={onAddTask}
              >
                + Task
              </button>
            </div>
            <div
              className="grid min-w-0"
              style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}
            >
              {hourLabels.map((label, i) => (
                <span className="hour-label" key={i}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Timeline rows */}
          {taskRows.map((row) => (
            <TimelineRow
              key={row.task.id}
              row={row}
              timelineStart={timelineStart}
              span={span}
              totalHours={totalHours}
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={setSelectedSegmentId}
              onPointerDown={startGesture}
              onPointerMove={moveGesture}
              onPointerUp={finishGesture}
            />
          ))}

          {taskRows.length === 0 && (
            <div className="timeline-empty-space" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}
