import { Fragment, useState, useEffect, useRef, type PointerEvent } from "react";
import { useAppStore } from "../store/app";
import { formatDuration, formatTime12h } from "../lib/utils";
import type { Segment, Task } from "../types";

export type TaskRow = {
  task: Task;
  segments: Segment[];
};

export interface TimelineRowProps {
  row: TaskRow;
  timelineStart: number;
  span: number;
  totalHours: number;
  selectedSegmentId: string | null;
  onSelectSegment: (id: string | null) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>, taskId: string) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
}

export function TimelineRow({
  row,
  timelineStart,
  span,
  totalHours,
  selectedSegmentId,
  onSelectSegment,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: TimelineRowProps) {
  const updateTask = useAppStore((s) => s.updateTask);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const [isEditing, setIsEditing] = useState(false);
  const [taskName, setTaskName] = useState(row.task.name);
  const deleteWhenEmptyRef = useRef(false);
  const cancelEditRef = useRef(false);

  useEffect(() => {
    setTaskName(row.task.name);
  }, [row.task.name]);

  async function handleSaveName() {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      deleteWhenEmptyRef.current = false;
      setTaskName(row.task.name);
      setIsEditing(false);
      return;
    }

    const shouldDelete = deleteWhenEmptyRef.current;
    deleteWhenEmptyRef.current = false;
    const trimmed = taskName.trim();
    setIsEditing(false);
    if (!trimmed) {
      setTaskName(row.task.name);
      if (shouldDelete) await deleteTask(row.task.id);
      return;
    }
    if (trimmed === row.task.name) {
      return;
    }
    await updateTask(row.task, trimmed);
  }

  return (
    <div
      className="timeline-sheet-row grid grid-cols-[minmax(140px,210px)_minmax(0,1fr)] border-t border-[#ececec]"
      key={row.task.id}
    >
      {/* Task Name Column - click to edit/rename */}
      <div className="timeline-task-cell flex min-w-0 items-center border-r border-[#ececec] px-3 py-1 text-[#444] text-sm font-medium">
        {isEditing ? (
          <input
            type="text"
            autoFocus
            className="w-full rounded border border-[#00775a] bg-white px-2 py-1 text-sm text-[#111] outline-none shadow-xs"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            onBlur={() => void handleSaveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                deleteWhenEmptyRef.current = taskName.trim().length === 0;
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEditRef.current = true;
                e.currentTarget.blur();
                setTaskName(row.task.name);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="group flex min-w-0 w-full items-center justify-between whitespace-normal rounded px-1.5 py-1 -mx-1 text-left text-sm font-medium text-[#333] hover:bg-[#f3f4f6] hover:text-black cursor-pointer transition-colors border-0 bg-transparent"
            onClick={() => setIsEditing(true)}
            title="Click to rename. Press Enter on a blank name to remove this task."
          >
            <span className="min-w-0 whitespace-normal break-words">{row.task.name}</span>
            <span className="shrink-0 text-[11px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
              ✎
            </span>
          </button>
        )}
      </div>

      {/* Timeline Column */}
      <div
        className="timeline"
        style={{
          backgroundImage:
            "linear-gradient(to right, transparent calc(100% - 1px), var(--sheet-rule) calc(100% - 1px))",
          backgroundSize: `${100 / totalHours}% 100%`,
          backgroundRepeat: "repeat-x",
        }}
        onPointerDown={(e) => {
          const bar = (e.target as HTMLElement).closest<HTMLElement>(".bar");
          if (bar?.dataset.id) {
            onSelectSegment(bar.dataset.id);
          } else {
            onSelectSegment(null);
          }
          onPointerDown(e, row.task.id);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {row.segments.map((seg) => {
          const isSelected = selectedSegmentId === seg.id;
          return (
            <Fragment key={seg.id}>
              <div
                className={`bar transition-shadow ${
                  isSelected
                    ? "!border-[#00775a] ring-2 ring-[#00775a] bg-[#f0fdf9] z-10"
                    : ""
                }`}
                data-id={seg.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSegment(seg.id);
                }}
                aria-label={`${formatTime12h(seg.start_minute)} to ${formatTime12h(seg.end_minute)}, ${formatDuration(seg.end_minute - seg.start_minute)}, ${row.task.name}${isSelected ? ". Press Backspace or Delete to remove." : ""}`}
                style={{
                  left: `${Math.max(0, Math.min(100, ((seg.start_minute - timelineStart) / span) * 100))}%`,
                  width: `${Math.max(2, Math.min(100, ((seg.end_minute - seg.start_minute) / span) * 100))}%`,
                }}
              >
                <span className="edge edge-start" />
                <span className="truncate select-none font-medium text-xs">
                  {formatDuration(seg.end_minute - seg.start_minute)}
                </span>
                <span className="edge edge-end" />
              </div>
              <div
                className="timeline-tooltip font-mono"
                style={{
                  left: `${(((seg.start_minute + seg.end_minute) / 2 - timelineStart) / span) * 100}%`,
                }}
              >
                {formatTime12h(seg.start_minute)} – {formatTime12h(seg.end_minute)} (
                {formatDuration(seg.end_minute - seg.start_minute)}) · {row.task.name}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
