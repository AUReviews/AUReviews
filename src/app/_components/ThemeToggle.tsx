"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Header theme toggle (v1-spec §13): one circular button showing the CURRENT
// mode's icon; each click advances system -> light -> dark -> system. With
// nothing stored the mode is "system". The choice lives in localStorage and
// is applied as `data-theme` on <html>: "light" | "dark" set the attribute,
// "system" removes it so globals.css's `prefers-color-scheme` block decides.
// layout.tsx applies the stored choice in an inline pre-hydration script, so
// the page never flashes the wrong palette; this component only reads it back
// after mount (the server render cannot know it) and handles clicks.
export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "aureviews-theme";

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// localStorage as an external store: the server snapshot is always "system"
// (it cannot know the viewer's choice), and the client snapshot re-reads
// after every write here or in another tab.
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// Cycle order; OPTIONS[i + 1] is what a click from OPTIONS[i] selects.
const OPTIONS: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
  {
    mode: "system",
    label: "System",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    mode: "light",
    label: "Light",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    mode: "dark",
    label: "Dark",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
];

export default function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readStoredMode, () => "system");

  function choose(next: ThemeMode) {
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode etc.): the choice still applies for
      // this page view, but the control cannot reflect it.
    }
    for (const cb of listeners) cb();
  }

  const index = OPTIONS.findIndex((o) => o.mode === mode);
  const current = OPTIONS[index];
  const next = OPTIONS[(index + 1) % OPTIONS.length];

  return (
    <button
      type="button"
      className="theme-btn"
      title={`Theme: ${current.label}. Switch to ${next.label.toLowerCase()}`}
      aria-label={`Theme: ${current.label}. Switch to ${next.label.toLowerCase()}`}
      onClick={() => choose(next.mode)}
    >
      {current.icon}
    </button>
  );
}
