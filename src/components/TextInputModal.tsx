import { useState, useEffect, useRef, type FormEvent } from "react";

interface TextInputModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  placeholder?: string;
  submitText?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}

export function TextInputModal({
  isOpen,
  title,
  label,
  placeholder = "",
  submitText = "Save",
  onClose,
  onSubmit,
}: TextInputModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${label} cannot be empty`);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none p-1"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {label}
            </label>
            <input
              ref={inputRef}
              type="text"
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-xs text-red-600" role="alert">
              {error}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2.5">
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#00775a] px-5 py-2 text-sm font-medium text-white hover:bg-[#00664d] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving…" : submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
