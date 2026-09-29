import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as api from "../lib/api";
import { formatDate } from "../lib/utils";
import type { Job, Task, Segment, Profile } from "../types";

type AppStore = {
  // ── Data ─────────────────────────────────────────────────────────────────
  jobs: Job[];
  tasks: Task[];
  segments: Segment[];
  profile: Profile | null;
  profileLoaded: boolean;

  // ── Undo / Redo History ──────────────────────────────────────────────────
  history: Segment[][];
  future: Segment[][];

  // ── Selected state ────────────────────────────────────────────────────────
  jobId: string;
  date: Date;

  // ── UI ───────────────────────────────────────────────────────────────────
  saving: boolean;
  saved: boolean;
  dirty: boolean;
  error: string;

  // ── Actions ───────────────────────────────────────────────────────────────
  setDate: (date: Date) => void;
  setSegments: (segments: Segment[] | ((prev: Segment[]) => Segment[])) => void;
  setError: (msg: string) => void;
  setSaved: (v: boolean) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  loadJobs: () => Promise<void>;
  loadProfile: () => Promise<void>;
  loadDay: (preserveHistory?: boolean) => Promise<void>;
  reload: () => Promise<void>;

  addJob: (name: string) => Promise<Job>;
  addTask: (name: string) => Promise<void>;
  updateTask: (task: Task, name: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  saveDay: () => Promise<void>;

  initListener: () => () => void;
};

export const useAppStore = create<AppStore>((set, get) => ({
  jobs: [],
  tasks: [],
  segments: [],
  profile: null,
  profileLoaded: false,
  history: [],
  future: [],
  jobId: "",
  date: (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })(),
  saving: false,
  saved: false,
  dirty: false,
  error: "",

  setDate: (date) => {
    const { dirty, date: current, saving } = get();
    if (saving) return;
    if (
      dirty &&
      date.getTime() !== current.getTime() &&
      !window.confirm("Discard unsaved time edits and change the date?")
    )
      return;
    set({ date, segments: [], saved: false, dirty: false, history: [], future: [] });
  },
  setSegments: (segments) =>
    set((state) => ({
      segments: typeof segments === "function" ? segments(state.segments) : segments,
      dirty: true,
      saved: false,
    })),
  setError: (error) => set({ error }),
  setSaved: (saved) => set({ saved }),

  pushHistory: () => {
    const { segments, history } = get();
    set({
      history: [...history.slice(-29), [...segments]],
      future: [],
    });
  },

  undo: () => {
    const { history, future, segments } = get();
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    set({
      segments: previous,
      history: history.slice(0, -1),
      future: [[...segments], ...future],
      saved: false,
      dirty: true,
    });
  },

  redo: () => {
    const { history, future, segments } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      segments: next,
      future: future.slice(1),
      history: [...history, [...segments]],
      saved: false,
      dirty: true,
    });
  },

  loadJobs: async () => {
    const result = await api.listJobs();
    const uniqueJobs = Array.from(
      new Map(result.map((job) => [job.name.trim().toLocaleLowerCase(), job])).values()
    );
    set((state) => ({
      jobs: uniqueJobs,
      jobId: uniqueJobs.some((j) => j.id === state.jobId)
        ? state.jobId
        : (uniqueJobs[0]?.id ?? ""),
    }));
  },

  loadProfile: async () => {
    const profile = await api.getProfile();
    set({ profile, profileLoaded: true });
  },

  loadDay: async (preserveHistory = false) => {
    const { jobId, date } = get();
    if (!jobId) {
      set({
        tasks: [],
        segments: [],
        ...(preserveHistory ? {} : { history: [], future: [] }),
        dirty: false,
      });
      return;
    }
    const currentDate = formatDate(date);
    const [tasks, segments] = await Promise.all([
      api.listTasks(jobId),
      api.getDayEntries(jobId, currentDate),
    ]);
    set({
      tasks,
      segments,
      ...(preserveHistory ? {} : { history: [], future: [] }),
      dirty: false,
    });
  },

  reload: async () => {
    const { loadJobs, loadProfile, loadDay, dirty } = get();
    await Promise.all([loadJobs(), loadProfile(), dirty ? Promise.resolve() : loadDay()]);
  },

  addJob: async (name) => {
    if (get().dirty) {
      await get().saveDay();
      if (get().dirty)
        throw new Error(get().error || "Save your time edits before creating a job.");
    }
    const job = await api.saveJob({ id: "", name, archived: false });
    const existingTasks = await api.listTasks(job.id);
    if (
      !existingTasks.some((task) => task.name.trim().toLocaleLowerCase() === "general")
    ) {
      await api.saveTask({ id: "", job_id: job.id, name: "General", archived: false });
    }
    await get().loadJobs();
    set({ jobId: job.id, error: "" });
    return job;
  },

  addTask: async (name) => {
    const { jobId, loadDay } = get();
    if (get().dirty) {
      await get().saveDay();
      if (get().dirty)
        throw new Error(get().error || "Save your time edits before adding a task.");
    }
    await api.saveTask({ id: "", job_id: jobId, name, archived: false });
    await loadDay();
    set({ error: "" });
  },

  updateTask: async (task, name) => {
    const { loadDay } = get();
    if (get().dirty) {
      await get().saveDay();
      if (get().dirty)
        throw new Error(get().error || "Save your time edits before renaming a task.");
    }
    await api.saveTask({ ...task, name: name.trim() });
    await loadDay();
    set({ error: "" });
  },

  deleteTask: async (taskId) => {
    if (get().dirty) {
      await get().saveDay();
      if (get().dirty) return;
    }
    try {
      // Archiving removes the task from the active ledger while preserving its evidence.
      await api.archiveTask(taskId);
      await get().loadDay();
      set({ error: "" });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearAllData: async () => {
    await api.clearAllData();
    set({
      jobs: [],
      tasks: [],
      segments: [],
      profile: null,
      profileLoaded: true,
      jobId: "",
      history: [],
      future: [],
      saved: false,
      dirty: false,
      error: "",
    });
  },

  saveDay: async () => {
    const { jobId, date, segments, saving } = get();
    if (saving) return;
    if (!jobId) {
      set({ error: "Create a job and task before submitting time." });
      return;
    }
    set({ saving: true, error: "" });
    try {
      const currentDate = formatDate(date);
      const entries = segments.map(({ task_id, start_minute, end_minute, note }) => ({
        task_id,
        work_date: currentDate,
        start_minute,
        end_minute,
        note: note ?? null,
      }));
      await api.saveDayEntries(jobId, currentDate, entries);
      set({ saved: true, dirty: false });
      await get().loadDay(true);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ saving: false });
    }
  },

  // Returns the unlisten cleanup function — call it in a useEffect cleanup
  initListener: () => {
    let unlisten: (() => void) | undefined;
    void listen("data-changed", () => {
      if (!get().saving) void get().reload();
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  },
}));
