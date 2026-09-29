import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./store/app";
import { asError } from "./lib/utils";
import { TimesheetCard } from "./components/TimesheetCard";
import { AnalyticsView } from "./components/AnalyticsView";
import { ProfileModal } from "./components/ProfileModal";
import "./App.css";

export default function App() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("alibi-theme") === "dark"
  );
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const loadJobs = useAppStore((s) => s.loadJobs);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const profile = useAppStore((s) => s.profile);
  const jobs = useAppStore((s) => s.jobs);
  const loadDay = useAppStore((s) => s.loadDay);
  const initListener = useAppStore((s) => s.initListener);
  const setError = useAppStore((s) => s.setError);
  const jobId = useAppStore((s) => s.jobId);
  const date = useAppStore((s) => s.date);
  const dirty = useAppStore((s) => s.dirty);
  const saveDay = useAppStore((s) => s.saveDay);

  // Initial data load
  useEffect(() => {
    let active = true;
    void Promise.all([loadJobs(), loadProfile()])
      .catch((e) => setError(asError(e)))
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, [loadJobs, loadProfile, setError]);

  // Reload day whenever job or date changes
  useEffect(() => {
    void loadDay().catch((e) => setError(asError(e)));
  }, [jobId, date]);

  // Subscribe to backend data-changed events
  useEffect(() => initListener(), []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("alibi-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    function handleWindowShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog']"
        )
      )
        return;

      const tauriWindow = getCurrentWindow();
      const key = event.key.toLowerCase();
      if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && key === "w")) {
        event.preventDefault();
        void tauriWindow.minimize();
      } else if (
        ((event.metaKey && key === "q") || (event.ctrlKey && key === "q")) &&
        dirty
      ) {
        event.preventDefault();
        void saveDay().then(() => {
          if (!useAppStore.getState().dirty) void tauriWindow.close();
        });
      } else if ((event.metaKey || event.ctrlKey) && key === "q") {
        event.preventDefault();
        void tauriWindow.close();
      }
    }

    globalThis.window.addEventListener("keydown", handleWindowShortcut);
    return () => globalThis.window.removeEventListener("keydown", handleWindowShortcut);
  }, [dirty, saveDay]);

  useEffect(() => {
    const window = getCurrentWindow();
    let closeAllowed = false;
    let unlisten: (() => void) | undefined;
    void window
      .onCloseRequested(async (event) => {
        if (closeAllowed || !useAppStore.getState().dirty) return;
        event.preventDefault();
        await useAppStore.getState().saveDay();
        if (!useAppStore.getState().dirty) {
          closeAllowed = true;
          await window.close();
        }
      })
      .then((stop) => {
        unlisten = stop;
      });
    return () => unlisten?.();
  }, []);

  return (
    <main className="app-shell h-screen w-screen flex flex-col overflow-hidden rounded-[24px]">
      <div
        data-tauri-drag-region
        className="window-drag-strip h-4 w-full shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 overflow-auto flex flex-col">
        {initializing ? (
          <div className="boot-screen" aria-label="Opening Alibi" />
        ) : !profile || jobs.length === 0 ? (
          <ProfileModal isOpen onClose={() => {}} presentation="page" />
        ) : analyticsOpen ? (
          <AnalyticsView onBack={() => setAnalyticsOpen(false)} />
        ) : (
          <TimesheetCard
            darkMode={darkMode}
            onToggleTheme={() => setDarkMode((current) => !current)}
            onAnalytics={() => setAnalyticsOpen(true)}
            onProfile={() => setProfileOpen(true)}
          />
        )}
      </div>
      {profileOpen && profile && jobs.length > 0 && (
        <ProfileModal isOpen onClose={() => setProfileOpen(false)} />
      )}
    </main>
  );
}
