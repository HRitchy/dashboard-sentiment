"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  STATE_SENTENCES,
} from "@/lib/classify";
import { useAiBulletin } from "@/lib/useAiBulletin";
import type {
  BulletinBias,
  BulletinCategory,
} from "@/lib/claude";
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
  return (v >= 0 ? "+" : "") + v.toFixed(3);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const BIAS_LABEL: Record<BulletinBias, string> = {
  HAUSSIER: "Haussier",
  BAISSIER: "Baissier",
  MITIGE: "Mitigé",
};

const CATEGORY_LABEL: Record<BulletinCategory, string> = {
  MACRO: "Macro",
  FED: "Fed",
  RESULTATS: "Résultats",
  GEO: "Géo",
  TECH: "Tech",
  CREDIT: "Crédit",
  MARCHE: "Marché",
};

const RELATIVE_TIME_FORMATTER =
  typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
    ? new Intl.RelativeTimeFormat("fr", { numeric: "auto" })
    : null;

function formatRelative(from: number, now: number): string {
  const diffSeconds = Math.round((from - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (!RELATIVE_TIME_FORMATTER) {
    if (abs < 60) return "à l'instant";
    if (abs < 3600) return `il y a ${Math.round(abs / 60)} min`;
    if (abs < 86400) return `il y a ${Math.round(abs / 3600)} h`;
    return `il y a ${Math.round(abs / 86400)} j`;
  }
  if (abs < 45) return RELATIVE_TIME_FORMATTER.format(diffSeconds, "second");
  if (abs < 2700) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 3600), "hour");
  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 86400), "day");
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
const API_KEY_KEY = "dashboard-anthropic-key";

type TabKey = "indicateurs" | "actualites";

export default function Dashboard() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [apiKey, setApiKey] = useState<string>("");
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [payload, setPayload] = useState<SentimentPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timestamp, setTimestamp] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("indicateurs");

  // Load persisted thresholds + theme + API key on mount (client-only).
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
      const savedKey = localStorage.getItem(API_KEY_KEY);
      if (savedKey) setApiKey(savedKey);
    } catch {
      /* ignore */
    } finally {
      setApiKeyLoaded(true);
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

  // Persist API key (skip until first load is done so we don't overwrite it).
  useEffect(() => {
    if (!apiKeyLoaded) return;
    try {
      if (apiKey) localStorage.setItem(API_KEY_KEY, apiKey);
      else localStorage.removeItem(API_KEY_KEY);
    } catch {
      /* ignore */
    }
  }, [apiKey, apiKeyLoaded]);

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
  const finalSentence = conv.state ? STATE_SENTENCES[conv.state] : "État indéterminé.";
  const aiBody = useMemo(() => {
    if (!apiKeyLoaded) return null;
    return {
      sentiment: conv.state ?? null,
      indicators: {
        vix: vix?.value ?? null,
        hyOas: oas?.value ?? null,
        fearGreed: fg?.value ?? null,
        nfci: nfci?.value ?? null,
      },
    };
  }, [
    apiKeyLoaded,
    conv.state,
    vix?.value,
    oas?.value,
    fg?.value,
    nfci?.value,
  ]);
  const ai = useAiBulletin("/api/ai/verdict", aiBody, {
    apiKey,
    dailyCacheKey: "dashboard-ai-verdict",
  });
  const aiHasContent = ai.headline.text.length > 0 || ai.bullets.length > 0;

  const refreshAll = useCallback(() => {
    void fetchData();
    ai.refresh();
  }, [ai, fetchData]);
  const aiErrorKind: "missing-key" | "rate-limit" | "transient" | null = ai.error
    ? /ANTHROPIC_API_KEY|clé/i.test(ai.error)
      ? "missing-key"
      : /429|limite/i.test(ai.error)
        ? "rate-limit"
        : "transient"
    : null;

  // Tick once a minute so the "il y a X" label stays fresh without a heavy timer.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const freshnessLabel = ai.lastUpdatedAt
    ? `Mis à jour ${formatRelative(ai.lastUpdatedAt, nowTick)}`
    : null;

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

        {/* Tabs */}
        <div className="tabs" role="tablist" aria-label="Sections du tableau de bord">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === "indicateurs"}
            className={`tab${activeTab === "indicateurs" ? " is-active" : ""}`}
            onClick={() => setActiveTab("indicateurs")}
          >
            Indicateurs
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === "actualites"}
            className={`tab${activeTab === "actualites" ? " is-active" : ""}`}
            onClick={() => setActiveTab("actualites")}
          >
            Actualités
          </button>
        </div>

        {activeTab === "actualites" && (
          <div
            className={`verdict-hero ${
              conv.state ? `panel-${conv.state.toLowerCase()}` : "panel-neutre"
            }`}
            role="tabpanel"
          >
            <div className="verdict">
              <div className="fade-in">
                {payload ? (
                  <div
                    className={`ai-commentary${ai.error ? " is-error" : ""}`}
                    aria-live="polite"
                    aria-busy={ai.loading}
                  >
                    <div className="ai-header-row">
                      <div className="ai-header-left">
                        {ai.headline.bias && !ai.error ? (
                          <span
                            className={`ai-bias-chip ai-bias-chip--${ai.headline.bias.toLowerCase()}`}
                            aria-label={`Tendance ${BIAS_LABEL[ai.headline.bias].toLowerCase()}`}
                          >
                            {BIAS_LABEL[ai.headline.bias]}
                          </span>
                        ) : ai.loading && !aiHasContent ? (
                          <span className="ai-bias-chip ai-bias-chip--skeleton skeleton" />
                        ) : null}
                      </div>
                      <div className="ai-header-right">
                        {freshnessLabel && !ai.error && (
                          <span
                            className="ai-freshness"
                            title={
                              ai.lastUpdatedAt
                                ? new Date(ai.lastUpdatedAt).toLocaleString("fr-FR")
                                : undefined
                            }
                          >
                            {freshnessLabel}
                          </span>
                        )}
                        <button
                          className={`icon-btn ai-refresh-icon ${ai.loading ? "spin" : ""}`}
                          onClick={ai.refresh}
                          disabled={ai.loading}
                          aria-label={ai.loading ? "Actualisation en cours" : "Rafraîchir l'IA"}
                          title="Rafraîchir l'IA"
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
                        </button>
                      </div>
                    </div>

                    {ai.error ? (
                      <div className="ai-error-block">
                        <p className="ai-error-message">
                          <span aria-hidden="true" className="ai-error-icon">
                            ⚠
                          </span>{" "}
                          {aiErrorKind === "missing-key"
                            ? "Clé Anthropic manquante ou invalide."
                            : aiErrorKind === "rate-limit"
                              ? "Limite de requêtes atteinte. Réessaie dans un instant."
                              : `Analyse IA indisponible : ${ai.error}`}
                        </p>
                        <div className="ai-error-actions">
                          {aiErrorKind === "missing-key" ? (
                            <button
                              className="ai-error-btn"
                              onClick={() => setSettingsOpen(true)}
                            >
                              Ouvrir les paramètres
                            </button>
                          ) : (
                            <button
                              className="ai-error-btn"
                              onClick={ai.refresh}
                              disabled={ai.loading}
                            >
                              Réessayer
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {ai.headline.text ? (
                          <p className="ai-headline">
                            {ai.headline.text}
                            {ai.loading && (
                              <span className="streaming-cursor" aria-hidden="true" />
                            )}
                          </p>
                        ) : ai.loading ? (
                          <p className="ai-headline ai-headline--skeleton">
                            <span className="skeleton skeleton-line" style={{ width: "82%" }} />
                          </p>
                        ) : null}

                        {ai.bullets.length > 0 ? (
                          <ul className="ai-bullets">
                            {ai.bullets.map((b, i) => (
                              <li key={i}>
                                {b.category && (
                                  <span
                                    className={`bullet-tag bullet-tag--${b.category.toLowerCase()}`}
                                  >
                                    {CATEGORY_LABEL[b.category]}
                                  </span>
                                )}
                                <span className="bullet-text">{b.text}</span>
                              </li>
                            ))}
                          </ul>
                        ) : ai.loading ? (
                          <ul className="ai-bullets ai-bullets--skeleton" aria-hidden="true">
                            <li>
                              <span className="skeleton skeleton-line" style={{ width: "94%" }} />
                            </li>
                            <li>
                              <span className="skeleton skeleton-line" style={{ width: "88%" }} />
                            </li>
                            <li>
                              <span className="skeleton skeleton-line" style={{ width: "76%" }} />
                            </li>
                            <li>
                              <span className="skeleton skeleton-line" style={{ width: "82%" }} />
                            </li>
                            <li>
                              <span className="skeleton skeleton-line" style={{ width: "65%" }} />
                            </li>
                          </ul>
                        ) : null}

                        {ai.sources.length > 0 ? (
                          <div className="ai-sources">
                            <span className="ai-sources-label">Sources</span>
                            <ul className="source-list">
                              {ai.sources.map((s) => {
                                const host = hostname(s.url);
                                return (
                                  <li key={s.url}>
                                    <a
                                      className="source-pill"
                                      href={s.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={s.title}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        className="source-favicon"
                                        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
                                        alt=""
                                        aria-hidden="true"
                                        width={14}
                                        height={14}
                                        loading="lazy"
                                      />
                                      <span>{host}</span>
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : ai.loading ? (
                          <div className="ai-sources" aria-hidden="true">
                            <span className="skeleton skeleton-line" style={{ width: "55%" }} />
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="ai-headline">Chargement des données…</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "indicateurs" && (
          <div role="tabpanel">
            {/* Global verdict — hero */}
            <div
              className={`verdict-hero ${
                conv.state ? `panel-${conv.state.toLowerCase()}` : "panel-neutre"
              }`}
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
                  onClick={refreshAll}
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
        )}

      </div>

      <SettingsModal
        open={settingsOpen}
        thresholds={thresholds}
        onChange={setThresholds}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
