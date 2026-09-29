import { useEffect, useState, type FormEvent } from "react";
import { useAppStore } from "../store/app";
import * as api from "../lib/api";
import { asError, parseTimeInput, formatTime12h } from "../lib/utils";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const profile = useAppStore((s) => s.profile);
  const jobs = useAppStore((s) => s.jobs);
  const jobId = useAppStore((s) => s.jobId);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const addJob = useAppStore((s) => s.addJob);
  const clearAllData = useAppStore((s) => s.clearAllData);
  const currentJob = jobs.find((job) => job.id === jobId);
  const currentJobName = currentJob?.name ?? "";

  const [name, setName] = useState(profile?.name ?? "");
  const [company, setCompany] = useState(profile?.company ?? "");
  const [workdayStart, setWorkdayStart] = useState(profile?.workday_start ?? "09:00 AM");
  const [workdayEnd, setWorkdayEnd] = useState(profile?.workday_end ?? "05:00 PM");
  const [timezone, setTimezone] = useState(
    profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [primaryRole, setPrimaryRole] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(profile?.name ?? "");
    setCompany(profile?.company ?? "");
    setWorkdayStart(profile?.workday_start ?? "09:00 AM");
    setWorkdayEnd(profile?.workday_end ?? "05:00 PM");
    setTimezone(profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setPrimaryRole(currentJobName);
    setError("");
    setConfirmClear(false);
  }, [isOpen, currentJobName]);

  if (!isOpen) return null;
  const firstRun = !profile || jobs.length === 0;
  const needsInitialJob = jobs.length === 0;

  async function handleClearAllData() {
    setClearing(true);
    setError("");
    try {
      await clearAllData();
      setConfirmClear(false);
      onClose();
    } catch (err) {
      setError(asError(err));
    } finally {
      setClearing(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !primaryRole.trim()) {
      setError("Name and job title are required.");
      return;
    }
    setError("");
    const startMins = parseTimeInput(workdayStart);
    const endMins = parseTimeInput(workdayEnd, true);
    if (startMins === null || endMins === null || endMins <= startMins) {
      setError("Enter valid start and end times, with the end later than the start.");
      return;
    }
    const normalizedStart = formatTime12h(startMins);
    const normalizedEnd = formatTime12h(endMins);

    setSaving(true);
    try {
      await api.saveProfile({
        name: name.trim(),
        company: company.trim() || null,
        workday_start: normalizedStart,
        workday_end: normalizedEnd,
        timezone: timezone.trim(),
      });
      if (currentJob) {
        await api.saveJob({ ...currentJob, name: primaryRole.trim() });
      } else {
        await addJob(primaryRole.trim());
      }
      await loadProfile();
      onClose();
    } catch (err) {
      setError(asError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !firstRun) {
          event.stopPropagation();
          onClose();
        }
      }}
      onClick={(e) => {
        if (!firstRun && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="profile-modal-title" className="text-lg font-semibold text-gray-900">
            {firstRun ? "Set Up Your Alibi" : "Work Profile & Hours"}
          </h2>
          {!firstRun && (
            <button
              type="button"
              className="clear-data-trigger"
              onClick={() => setConfirmClear(true)}
              disabled={saving || clearing}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
              Clear all data
            </button>
          )}
        </div>

        {firstRun && (
          <p className="-mt-2 mb-4 text-sm text-gray-500">
            Calibrate your daily timeline to match your working hours.
          </p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Full Name
            </label>
            <input
              type="text"
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none"
              placeholder="e.g. Alex Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Role / job title
            </label>
            <input
              type="text"
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none"
              placeholder="e.g. Staff Frontend Engineer"
              value={primaryRole}
              onChange={(e) => setPrimaryRole(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Company (optional)
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none"
              placeholder="e.g. Acme Corp"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Workday Start (12h)
              </label>
              <input
                type="text"
                required
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none"
                placeholder="09:00 AM"
                value={workdayStart}
                onChange={(e) => setWorkdayStart(e.target.value)}
              />
              {needsInitialJob && (
                <small className="mt-1 block text-[10px] text-gray-500">
                  Accepts 9, 9am, 09:00, or 9:00 AM
                </small>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Workday End (12h)
              </label>
              <input
                type="text"
                required
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none"
                placeholder="05:00 PM"
                value={workdayEnd}
                onChange={(e) => setWorkdayEnd(e.target.value)}
              />
              {needsInitialJob && (
                <small className="mt-1 block text-[10px] text-gray-500">
                  For evening hours, use 9pm or 21:00
                </small>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Timezone
            </label>
            <input
              type="text"
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-xs text-red-600" role="alert">
              {error}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-3">
            {!firstRun && (
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={onClose}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#00775a] px-5 py-2 text-sm font-medium text-white hover:bg-[#00664d] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
      {confirmClear && (
        <div
          className="clear-data-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-data-title"
          aria-describedby="clear-data-description"
          onClick={(event) => {
            if (event.target === event.currentTarget && !clearing) {
              setConfirmClear(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !clearing) {
              event.stopPropagation();
              setConfirmClear(false);
            }
          }}
        >
          <section className="clear-data-dialog">
            <h3 id="clear-data-title">Clear all Alibi data?</h3>
            <p id="clear-data-description">
              This permanently removes your profile, jobs, tasks, schedules, and all saved
              time entries from this device.
            </p>
            {error && (
              <p className="clear-data-error" role="alert">
                {error}
              </p>
            )}
            <div className="clear-data-actions">
              <button
                type="button"
                className="clear-data-cancel"
                disabled={clearing}
                onClick={() => setConfirmClear(false)}
              >
                Keep my data
              </button>
              <button
                type="button"
                className="clear-data-confirm"
                disabled={clearing}
                onClick={() => void handleClearAllData()}
              >
                {clearing ? "Clearing…" : "Delete all data"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
