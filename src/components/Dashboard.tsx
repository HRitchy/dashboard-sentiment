"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  NFCI_RANGE,
  NFCI_THRESHOLDS,
  type SentimentPayload,
} from "@/lib/types";
import {
  classifyFg,
  classifyHyOas,
  classifyNfci,
  classifyVix,
  convergence,
  INDETERMINATE_RECOMMENDATION,
  STATE_LABELS,
  STATE_RECOMMENDATIONS,
  STATE_SENTENCES,
} from "@/lib/classify";
import { useTheme } from "@/lib/use-theme";
import { useThresholds } from "@/lib/use-thresholds";
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
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  return `${DD}.${MM} · ${hh}:${mm}:${ss}`;
}

export default function Dashboard() {
  const { thresholds, setThresholds } = useThresholds();
  const { theme, toggle: toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [payload, setPayload] = useState<SentimentPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/sentiment", { cache: "no-store" });
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);
      const data = (await res.json()) as SentimentPayload;
      setPayload(data);
      setNow(new Date());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // One-shot client fetch on mount. The aggregator route is dynamic and
    // changes often; Server Components / `use()` would need Suspense plumbing
    // that doesn't fit the Refresh-button UX.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  // Live clock — single interval started once data arrives.
  useEffect(() => {
    if (!payload) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [payload]);

  const vix = payload?.vix;
  const oas = payload?.hyOas;
  const fg = payload?.fearGreed;
  const nfci = payload?.nfci;

  const vixState = classifyVix(vix?.value ?? null, thresholds.vix);
  const oasState = classifyHyOas(oas?.value ?? null, thresholds.oas);
  const fgState = classifyFg(fg?.value ?? null, thresholds.fg);
  const nfciState = classifyNfci(nfci?.value ?? null);

  const conv = convergence([vixState, oasState, fgState]);
  const finalSentence = conv.state ? STATE_SENTENCES[conv.state] : "État indéterminé.";
  const recommendation = conv.state
    ? STATE_RECOMMENDATIONS[conv.state]
    : INDETERMINATE_RECOMMENDATION;

  const errors = [
    vix?.error ? `VIX: ${vix.error}` : null,
    oas?.error ? `HY OAS: ${oas.error}` : null,
    fg?.error ? `F&G: ${fg.error}` : null,
    nfci?.error ? `NFCI: ${nfci.error}` : null,
  ].filter((x): x is string => !!x);

  return (
    <>
      <div className="shell">
        <div className="topbar">
          <Link href="/sp500" className="topbar-link" title="S&P 500">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
            S&amp;P 500
          </Link>
          <div className="topbar-actions">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title="Thème"
              aria-label={`Basculer en thème ${theme === "light" ? "sombre" : "clair"}`}
            >
              {theme === "light" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              )}
            </button>
            <button
              className="icon-btn"
              onClick={() => setSettingsOpen(true)}
              title="Paramètres"
              aria-label="Ouvrir les paramètres"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </button>
          </div>
        </div>

        {(fetchError || errors.length > 0) && (
          <div className="err-banner" role="alert">
            <b>ERR</b>
            {fetchError ?? errors.join(" · ")}
          </div>
        )}

        {/* Global verdict — hero with state-tinted background */}
        <div
          className={`verdict-hero${conv.state ? ` tinted w-${conv.state.toLowerCase()}` : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="verdict" key={finalSentence}>
            <div className="fade-in">
              <h2
                className={`verdict-title ${
                  conv.state ? `w-${conv.state.toLowerCase()}` : ""
                }`}
              >
                {conv.state ? finalSentence : <em>{finalSentence}</em>}
              </h2>
              <div className="verdict-signal">
                <span className="sig-label">{recommendation}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="header">
          <div className="refresh-block">
            <div className="timestamp">
              <span className="pulse" aria-hidden="true" />
              {now ? formatTime(now) : "—"}
            </div>
            <button
              className={`refresh-btn ${refreshing ? "spin" : ""}`}
              onClick={fetchData}
              disabled={refreshing}
              aria-label={refreshing ? "Actualisation en cours" : "Actualiser les données"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              {refreshing ? "Actualisation" : "Actualiser"}
            </button>
          </div>
        </div>

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
            history={vix?.history}
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
            history={oas?.history}
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
            history={fg?.history}
            compact
          />
        </div>

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
          history={nfci?.history}
        />

        {/* States legend */}
        <div className="states-legend" aria-label="Légende des états">
          <div className="states-legend-title">États possibles</div>
          <ul className="states-legend-list">
            <li><span className="dot w-euphorie" aria-hidden="true" />{STATE_LABELS.EUPHORIE} <em>marché très optimiste, vigilance</em></li>
            <li><span className="dot w-calme" aria-hidden="true" />{STATE_LABELS.CALME} <em>conditions normales, faible volatilité</em></li>
            <li><span className="dot w-neutre" aria-hidden="true" />{STATE_LABELS.NEUTRE} <em>aucun signal directionnel</em></li>
            <li><span className="dot w-stress" aria-hidden="true" />{STATE_LABELS.STRESS} <em>tensions visibles, prudence</em></li>
            <li><span className="dot w-panique" aria-hidden="true" />{STATE_LABELS.PANIQUE} <em>peur dominante, opportunité</em></li>
          </ul>
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
