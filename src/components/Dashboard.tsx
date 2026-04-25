"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_THRESHOLDS,
  NFCI_RANGE,
  NFCI_THRESHOLDS,
  type SentimentPayload,
  type Thresholds,
} from "@/lib/types";
import {
  classifyFg,
  classifyHyOas,
  classifyNfci,
  classifyVix,
  convergence,
  SIGNAL_LABELS,
  STATE_LABELS,
  STATE_SIGNALS,
} from "@/lib/classify";
import SettingsModal from "./SettingsModal";
import Speedometer, { type SpeedoZone } from "./Speedometer";

const VIX_RANGE = { min: 0, max: 50 } as const;
const VIX_TICKS = [0, 10, 20, 30, 40, 50];

const OAS_RANGE = { min: 2, max: 10 } as const;
const OAS_TICKS = [2, 4, 6, 8, 10];

const FG_RANGE = { min: 0, max: 100 } as const;
const FG_TICKS = [0, 25, 50, 75, 100];

const NFCI_TICKS = [-2, -1, 0, 1, 2, 3, 4];

function nfciValue(v: number): string {
  return (v >= 0 ? "+" : "") + String(v);
}

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
  const nfci = payload?.nfci;

  const vixState = classifyVix(vix?.value ?? null, thresholds.vix);
  const oasState = classifyHyOas(oas?.value ?? null, thresholds.oas);
  const fgState = classifyFg(fg?.value ?? null, thresholds.fg);
  const nfciState = classifyNfci(nfci?.value ?? null);

  const conv = convergence([vixState, oasState, fgState]);
  const finalLabel = conv.state ? STATE_LABELS[conv.state] : "Indéterminé";
  const titleIsLong = finalLabel.length > 8;
  const signal = conv.state ? STATE_SIGNALS[conv.state] : null;

  // Build a single error banner summarising individual reading failures.
  const errors = [
    vix?.error ? `VIX: ${vix.error}` : null,
    oas?.error ? `HY OAS: ${oas.error}` : null,
    fg?.error ? `F&G: ${fg.error}` : null,
    nfci?.error ? `NFCI: ${nfci.error}` : null,
  ].filter((x): x is string => !!x);

  return (
    <>
      <div className="shell">
        {/* Top bar */}
        <div className="topbar">
          <Link href="/sp500" className="topbar-link" title="S&P 500">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
            S&amp;P 500
          </Link>
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
              {signal && (
                <div className={`verdict-signal sig-${signal.toLowerCase()}`}>
                  <span className="sig-arrow" aria-hidden>
                    {signal === "ACHETER" ? "↗" : "↘"}
                  </span>
                  <span className="sig-label">{SIGNAL_LABELS[signal]}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="header">
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

        {/* Indicator speedometers — VIX / HY OAS / Fear & Greed */}
        <div className="speedos-row">
          <Speedometer
            name="VIX"
            source={vix?.source ?? "^VIX · CBOE"}
            value={vix?.value ?? null}
            range={VIX_RANGE}
            ticks={VIX_TICKS}
            zones={[
              { from: VIX_RANGE.min, to: thresholds.vix.euphorie, cls: "seg-euphorie" },
              { from: thresholds.vix.euphorie, to: thresholds.vix.calme, cls: "seg-calme" },
              { from: thresholds.vix.calme, to: thresholds.vix.stress, cls: "seg-stress" },
              { from: thresholds.vix.stress, to: VIX_RANGE.max, cls: "seg-panique" },
            ] satisfies SpeedoZone[]}
            formatValue={(v) => v.toFixed(2)}
            loading={refreshing && !payload}
            error={vix?.error}
            state={vixState}
            compact
          />
          <Speedometer
            name="HY OAS"
            source={oas?.source ?? "BAMLH0A0HYM2 · FRED"}
            value={oas?.value ?? null}
            range={OAS_RANGE}
            ticks={OAS_TICKS}
            zones={[
              { from: OAS_RANGE.min, to: thresholds.oas.euphorie, cls: "seg-euphorie" },
              { from: thresholds.oas.euphorie, to: thresholds.oas.calme, cls: "seg-calme" },
              { from: thresholds.oas.calme, to: thresholds.oas.stress, cls: "seg-stress" },
              { from: thresholds.oas.stress, to: OAS_RANGE.max, cls: "seg-panique" },
            ] satisfies SpeedoZone[]}
            formatValue={(v) => `${v.toFixed(2)}%`}
            asOf={oas?.asOf ?? null}
            loading={refreshing && !payload}
            error={oas?.error}
            state={oasState}
            compact
          />
          <Speedometer
            name="Fear & Greed"
            source={fg?.source ?? "CNN · 0–100"}
            value={fg?.value ?? null}
            range={FG_RANGE}
            ticks={FG_TICKS}
            zones={[
              { from: FG_RANGE.min, to: thresholds.fg.panique, cls: "seg-panique" },
              { from: thresholds.fg.panique, to: thresholds.fg.stress, cls: "seg-stress" },
              { from: thresholds.fg.stress, to: thresholds.fg.neutre, cls: "seg-neutre" },
              { from: thresholds.fg.neutre, to: thresholds.fg.calme, cls: "seg-calme" },
              { from: thresholds.fg.calme, to: FG_RANGE.max, cls: "seg-euphorie" },
            ] satisfies SpeedoZone[]}
            formatValue={(v) => v.toFixed(0)}
            loading={refreshing && !payload}
            error={fg?.error}
            state={fgState}
            compact
          />
        </div>

        {/* Market conditions speedometer (NFCI) */}
        <Speedometer
          name="Conditions de marché"
          source={nfci?.source ?? "FRED · NFCI"}
          value={nfci?.value ?? null}
          range={NFCI_RANGE}
          ticks={NFCI_TICKS}
          zones={[
            { from: NFCI_RANGE.min, to: NFCI_THRESHOLDS.calme, cls: "seg-euphorie" },
            { from: NFCI_THRESHOLDS.calme, to: NFCI_THRESHOLDS.normal, cls: "seg-neutre" },
            { from: NFCI_THRESHOLDS.normal, to: NFCI_THRESHOLDS.stress, cls: "seg-stress" },
            { from: NFCI_THRESHOLDS.stress, to: NFCI_RANGE.max, cls: "seg-panique" },
          ] satisfies SpeedoZone[]}
          formatValue={nfciValue}
          asOf={nfci?.asOf ?? null}
          loading={refreshing && !payload}
          error={nfci?.error}
          state={nfciState}
        />

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
