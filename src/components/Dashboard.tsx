"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_THRESHOLDS,
  type SentimentPayload,
  type Thresholds,
} from "@/lib/types";
import {
  classifyFg,
  classifyHyOas,
  classifyVix,
  convergence,
  STATE_LABELS,
} from "@/lib/classify";
import Indicator from "./Indicator";
import SettingsModal from "./SettingsModal";

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  return `${DD}.${MM} · ${hh}:${mm}:${ss}`;
}

const STORAGE_KEY = "dashboard-thresholds";
const THEME_KEY = "dashboard-theme";

export default function Dashboard() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [payload, setPayload] = useState<SentimentPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timestamp, setTimestamp] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Load persisted thresholds + theme on mount (client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Thresholds>;
        setThresholds({
          vix: { ...DEFAULT_THRESHOLDS.vix, ...(parsed.vix ?? {}) },
          oas: { ...DEFAULT_THRESHOLDS.oas, ...(parsed.oas ?? {}) },
          fg: { ...DEFAULT_THRESHOLDS.fg, ...(parsed.fg ?? {}) },
        });
      }
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist thresholds.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
    } catch {
      /* ignore */
    }
  }, [thresholds]);

  // Sync theme attribute + persist.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/sentiment", { cache: "no-store" });
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);
      const data = (await res.json()) as SentimentPayload;
      setPayload(data);
      setTimestamp(new Date(data.fetchedAt));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Live ticking clock on the timestamp pulse.
  useEffect(() => {
    if (!timestamp) return;
    const id = setInterval(() => setTimestamp(new Date()), 1000);
    return () => clearInterval(id);
  }, [timestamp == null]);

  const vix = payload?.vix;
  const oas = payload?.hyOas;
  const fg = payload?.fearGreed;

  const vixState = classifyVix(vix?.value ?? null, thresholds.vix);
  const oasState = classifyHyOas(oas?.value ?? null, thresholds.oas);
  const fgState = classifyFg(fg?.value ?? null, thresholds.fg);

  const conv = convergence([vixState, oasState, fgState]);
  const finalLabel = conv.state ? STATE_LABELS[conv.state] : "Indéterminé";
  const titleIsLong = finalLabel.length > 8;

  const today = new Date();
  const todayLabel = `${String(today.getDate()).padStart(2, "0")}.${String(
    today.getMonth() + 1
  ).padStart(2, "0")}.${today.getFullYear()}`;

  // Build a single error banner summarising individual reading failures.
  const errors = [
    vix?.error ? `VIX: ${vix.error}` : null,
    oas?.error ? `HY OAS: ${oas.error}` : null,
    fg?.error ? `F&G: ${fg.error}` : null,
  ].filter((x): x is string => !!x);

  return (
    <>
      <div className="shell">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-actions">
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title="Thème"
            >
              {theme === "light" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              )}
            </button>
            <button
              className="icon-btn"
              onClick={() => setSettingsOpen(true)}
              title="Paramètres"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error banner */}
        {(fetchError || errors.length > 0) && (
          <div className="err-banner">
            <b>ERR</b>
            {fetchError ?? errors.join(" · ")}
          </div>
        )}

        {/* Global verdict — hero */}
        <div className="verdict-hero">
          <div className="verdict" key={finalLabel}>
            <div className="fade-in">
              <h2
                className={`verdict-title ${titleIsLong ? "small" : ""} ${
                  conv.state ? `w-${finalLabel.toLowerCase()}` : ""
                }`}
              >
                {conv.state ? finalLabel : <em>Indéterminé</em>}
              </h2>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="header">
          <div>
            <div className="eyebrow">{todayLabel}</div>
          </div>
          <div className="refresh-block">
            <div className="timestamp">
              <span className="pulse" />
              {timestamp ? formatTime(timestamp) : "—"}
            </div>
            <button
              className={`refresh-btn ${refreshing ? "spin" : ""}`}
              onClick={fetchData}
              disabled={refreshing}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              {refreshing ? "Actualisation" : "Actualiser"}
            </button>
          </div>
        </div>

        {/* Indicators */}
        <div className="indicators">
          <Indicator
            name="VIX"
            src={vix?.source ?? "^VIX · CBOE"}
            value={vix?.value ?? null}
            delta={vix?.delta ?? null}
            state={vixState}
            format={(v) => v.toFixed(2)}
            loading={refreshing && !payload}
            error={vix?.error}
          />
          <Indicator
            name="HY OAS"
            src={oas?.source ?? "BAMLH0A0HYM2 · FRED"}
            value={oas?.value ?? null}
            unit="%"
            delta={oas?.delta ?? null}
            state={oasState}
            format={(v) => v.toFixed(2)}
            loading={refreshing && !payload}
            error={oas?.error}
          />
          <Indicator
            name="Fear & Greed"
            src={fg?.source ?? "CNN · 0–100"}
            value={fg?.value ?? null}
            delta={fg?.delta ?? null}
            state={fgState}
            format={(v) => v.toFixed(0)}
            loading={refreshing && !payload}
            error={fg?.error}
          />
        </div>

        <div className="foot">
          <span>yfinance · FRED · CNN</span>
          <span>{theme.toUpperCase()}</span>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        thresholds={thresholds}
        onChange={setThresholds}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
