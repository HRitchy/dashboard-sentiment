"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./types";

const STORAGE_KEY = "dashboard-thresholds";

function readThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<Thresholds>;
    return {
      vix: { ...DEFAULT_THRESHOLDS.vix, ...(parsed.vix ?? {}) },
      oas: { ...DEFAULT_THRESHOLDS.oas, ...(parsed.oas ?? {}) },
      fg: { ...DEFAULT_THRESHOLDS.fg, ...(parsed.fg ?? {}) },
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

// Cache the current snapshot so useSyncExternalStore returns a stable reference
// when the underlying value hasn't changed.
let cachedSnapshot: Thresholds = DEFAULT_THRESHOLDS;
let cachedRaw: string | null = "__init__";

function getSnapshot(): Thresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = readThresholds();
  return cachedSnapshot;
}

function getServerSnapshot(): Thresholds {
  return DEFAULT_THRESHOLDS;
}

const EVENT = "dashboard-thresholds-change";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  const onLocal = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onLocal);
  };
}

export function useThresholds(): {
  thresholds: Thresholds;
  setThresholds: (t: Thresholds) => void;
} {
  const thresholds = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setThresholds = useCallback((t: Thresholds) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENT));
    }
  }, []);

  return { thresholds, setThresholds };
}
