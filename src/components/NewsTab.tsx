"use client";

import { useCallback, useEffect, useState } from "react";
import type { BulletinBias, BulletinCategory } from "@/lib/claude";
import { useAiBulletin } from "@/lib/useAiBulletin";
import type { SentimentState } from "@/lib/types";

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
    if (abs < 3_600) return `il y a ${Math.round(abs / 60)} min`;
    if (abs < 86_400) return `il y a ${Math.round(abs / 3_600)} h`;
    return `il y a ${Math.round(abs / 86_400)} j`;
  }
  if (abs < 45) return RELATIVE_TIME_FORMATTER.format(diffSeconds, "second");
  if (abs < 2_700) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 3_600), "hour");
  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 86_400), "day");
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface AiBody {
  sentiment: string | null;
  indicators: {
    vix: number | null;
    hyOas: number | null;
    fearGreed: number | null;
    nfci: number | null;
  };
}

interface NewsTabProps {
  convState: SentimentState | null;
  dataLoaded: boolean;
  aiBody: AiBody | null;
  apiKey: string;
  onOpenSettings: () => void;
}

const SKELETON_WIDTHS = [94, 88, 76, 82, 65] as const;

export default function NewsTab({
  convState,
  dataLoaded,
  aiBody,
  apiKey,
  onOpenSettings,
}: NewsTabProps) {
  const ai = useAiBulletin("/api/ai/verdict", aiBody, {
    apiKey,
    dailyCacheKey: "dashboard-ai-verdict",
  });

  const aiHasContent = ai.headline.text.length > 0 || ai.bullets.length > 0;

  const aiErrorKind: "missing-key" | "rate-limit" | "transient" | null = ai.error
    ? /ANTHROPIC_API_KEY|clé/i.test(ai.error)
      ? "missing-key"
      : /429|limite/i.test(ai.error)
        ? "rate-limit"
        : "transient"
    : null;

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { refresh: aiRefresh } = ai;
  const refresh = useCallback(() => {
    setNowTick(Date.now());
    aiRefresh();
  }, [aiRefresh]);

  const freshnessLabel = ai.lastUpdatedAt
    ? `Mis à jour ${formatRelative(ai.lastUpdatedAt, nowTick)}`
    : null;

  return (
    <div
      className={`verdict-hero ${convState ? `panel-${convState.toLowerCase()}` : "panel-neutre"}`}
      role="tabpanel"
      id="tabpanel-actualites"
      aria-labelledby="tab-actualites"
    >
      <div className="verdict">
        <div className="fade-in">
          {!dataLoaded ? (
            <p className="ai-headline">Chargement des données…</p>
          ) : (
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
                    className={`icon-btn ai-refresh-icon${ai.loading ? " spin" : ""}`}
                    onClick={refresh}
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
                      <button className="ai-error-btn" onClick={onOpenSettings}>
                        Ouvrir les paramètres
                      </button>
                    ) : (
                      <button
                        className="ai-error-btn"
                        onClick={refresh}
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
                        <li key={`${i}-${b.text}`}>
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
                      {SKELETON_WIDTHS.map((w) => (
                        <li key={w}>
                          <span className="skeleton skeleton-line" style={{ width: `${w}%` }} />
                        </li>
                      ))}
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
          )}
        </div>
      </div>
    </div>
  );
}
