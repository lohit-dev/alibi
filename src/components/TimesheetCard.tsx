import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/app";
import { displayDate, formatDate, formatDuration } from "../lib/utils";
import { Timeline } from "./Timeline";
import { TextInputModal } from "./TextInputModal";
import { DailySummaryModal } from "./DailySummaryModal";
import { getEndOfDayStatus } from "../lib/api";
import { parseTimeInput } from "../lib/utils";

const appWindow = getCurrentWindow();

function CurrentJob({
  jobs,
  value,
}: {
  jobs: { id: string; name: string }[];
  value: string;
}) {
  const selectedJob = jobs.find((job) => job.id === value);

  return (
    <div
      className="job-current-value"
      role="textbox"
      aria-readonly="true"
      aria-label="Current job"
    >
      {selectedJob?.name ?? "No job set"}
    </div>
  );
}

export function TimesheetCard({
  darkMode,
  onToggleTheme,
  onAnalytics,
  onProfile,
}: {
  darkMode: boolean;
  onToggleTheme: () => void;
  onAnalytics: () => void;
  onProfile: () => void;
}) {
  const jobs = useAppStore((s) => s.jobs);
  const jobId = useAppStore((s) => s.jobId);
  const date = useAppStore((s) => s.date);
  const segments = useAppStore((s) => s.segments);
  const profile = useAppStore((s) => s.profile);
  const saving = useAppStore((s) => s.saving);
  const saved = useAppStore((s) => s.saved);
  const dirty = useAppStore((s) => s.dirty);
  const error = useAppStore((s) => s.error);

  const setDate = useAppStore((s) => s.setDate);
  const setSaved = useAppStore((s) => s.setSaved);
  const loadDay = useAppStore((s) => s.loadDay);
  const saveDay = useAppStore((s) => s.saveDay);
  const addTask = useAppStore((s) => s.addTask);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const endMinute = parseTimeInput(profile.workday_end, true);
    if (endMinute === null) return;
    const checkEndOfDay = async () => {
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < endMinute + 5) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayKey = formatDate(today);
      const shownKey = `alibi-eod-summary-${dayKey}`;
      if (localStorage.getItem(shownKey)) return;
      try {
        const status = await getEndOfDayStatus(dayKey);
        if (status.is_workday_finished) {
          localStorage.setItem(shownKey, "shown");
          setIsSummaryOpen(true);
        }
      } catch {
        /* The normal timeline stays usable if the optional summary check fails. */
      }
    };
    void checkEndOfDay();
    const timer = window.setInterval(() => void checkEndOfDay(), 60_000);
    return () => window.clearInterval(timer);
  }, [profile]);

  const totalMinutes = segments.reduce(
    (sum, s) => sum + s.end_minute - s.start_minute,
    0
  );

  const currentJob = jobs.find((j) => j.id === jobId);

  const initials = profile?.name
    ? profile.name
        .trim()
        .split(/\s+/)
        .map((n: string) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  function changeDay(delta: number) {
    setDate(
      (() => {
        const next = new Date(date);
        next.setDate(next.getDate() + delta);
        return next;
      })()
    );
    setSaved(false);
  }

  function handleHeaderMouseDown(e: React.MouseEvent) {
    // Only drag if left click and not on a button, input, or select
    const target = e.target as HTMLElement;
    if (e.button === 0 && !target.closest("button, input, select, textarea")) {
      void appWindow.startDragging().catch(() => {});
    }
  }

  async function handleCreateTask(name: string) {
    await addTask(name);
  }

  async function handleLockIn() {
    if (!jobId) {
      onProfile();
      return;
    }
    await saveDay();
    if (useAppStore.getState().saved) setIsSummaryOpen(true);
  }

  async function handleOpenAnalytics() {
    if (dirty) {
      await saveDay();
      if (useAppStore.getState().dirty) return;
    }
    onAnalytics();
  }

  return (
    <>
      <div className="flex min-h-full w-full flex-col justify-between px-6 py-4 sm:px-8 sm:py-5">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex select-none items-center justify-between gap-4">
            <div
              data-tauri-drag-region
              onMouseDown={handleHeaderMouseDown}
              className="flex-1 flex items-center py-1 cursor-default"
            >
              <h1
                data-tauri-drag-region
                className="m-0 text-[21px] font-semibold tracking-[-0.025em] leading-tight text-[#111]"
              >
                Daily ledger
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="theme-toggle h-9 w-9 rounded-full border text-sm"
                onClick={onToggleTheme}
                aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? "☀" : "☾"}
              </button>
              <button
                type="button"
                className="analytics-launch rounded-full border px-3 py-2 text-xs"
                onClick={() => void handleOpenAnalytics()}
              >
                Analytics
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00775a] text-white text-xs font-semibold shadow-xs hover:ring-2 hover:ring-[#00775a]/30 hover:opacity-95 transition-all cursor-pointer border border-transparent hover:border-white/20 select-none shrink-0"
                onClick={onProfile}
                aria-label="Set profile and office hours"
                title={
                  profile?.name ? `${profile.name} • Profile & Hours` : "Profile & Hours"
                }
              >
                {initials ? (
                  <span>{initials}</span>
                ) : (
                  <svg
                    className="h-4 w-4 fill-current opacity-90"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Job + Date row */}
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[240px] flex-1">
              <label className="mb-2 block text-sm font-semibold text-[#444]">Job</label>
              <CurrentJob jobs={jobs} value={jobId} />
            </div>

            <div className="min-w-[240px] flex-1">
              <label className="mb-2 block text-sm font-semibold text-[#444]">Date</label>
              <div className="flex h-[46px] items-center justify-between gap-2 rounded-xl border border-[#e2e2e2] px-3.5 bg-white">
                <span className="truncate text-[#111]">{displayDate(date)}</span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="w-7 border-0 bg-transparent text-2xl leading-none text-[#555] hover:text-black cursor-pointer"
                    onClick={() => changeDay(-1)}
                    aria-label="Previous day"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="w-7 border-0 bg-transparent text-2xl leading-none text-[#555] hover:text-black cursor-pointer"
                    onClick={() => changeDay(1)}
                    aria-label="Next day"
                  >
                    ›
                  </button>
                </span>
              </div>
            </div>
          </div>

          {/* Timeline grid */}
          <Timeline
            key={date.toDateString()}
            onAddTask={() => setIsTaskModalOpen(true)}
          />
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#f0f0f0] pt-4">
          <span className="flex flex-col text-sm text-[#555]">
            <span className="font-mono">
              {segments.length === 0
                ? "No time recorded for this day"
                : `Total: ${formatDuration(totalMinutes)} Hours`}
            </span>
            {saved && (
              <small className="mt-1 text-[10px] text-[#5c6672]">Saved locally</small>
            )}
          </span>
          <span className="flex items-center gap-5">
            <button
              type="button"
              className="border-0 bg-transparent px-2 py-2 text-sm text-[#555] hover:text-black cursor-pointer"
              onClick={() => {
                if (useAppStore.getState().dirty) void loadDay();
                else void appWindow.minimize();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              id="submit"
              className="min-h-10 rounded-xl bg-[#00775a] px-5 text-sm font-medium text-white disabled:cursor-default disabled:opacity-50 cursor-pointer transition-colors hover:bg-[#00664d]"
              onClick={() => void handleLockIn()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save & review day"}
            </button>
          </span>
        </div>

        {error && (
          <div className="mt-3 text-xs text-[#b00020]" role="alert">
            {error}
          </div>
        )}
      </div>

      <TextInputModal
        isOpen={isTaskModalOpen}
        title={currentJob ? `Add Task for "${currentJob.name}"` : "Add Task"}
        label="Task Name"
        placeholder="e.g. Design review"
        submitText="Add Task"
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={handleCreateTask}
      />

      {isSummaryOpen && (
        <DailySummaryModal
          date={formatDate(date)}
          onClose={() => setIsSummaryOpen(false)}
          onAnalytics={() => {
            setIsSummaryOpen(false);
            onAnalytics();
          }}
        />
      )}
    </>
  );
}
