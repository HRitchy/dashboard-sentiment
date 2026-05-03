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

// ─── MOCKED DATA CONSTANTS ────────────────────────────────────────────────────

const MARKET_READING_MOCK = { driver: "Résultats T1 > macro > géo", conviction: 72 } as const;

type ImpactLevel = "FORT" | "MOYEN" | "FAIBLE";
type StatusLevel = "CONFIRME" | "A_SURVEILLER" | null;

const IMPACT_LABEL: Record<ImpactLevel, string> = { FORT: "Fort", MOYEN: "Moyen", FAIBLE: "Faible" };
const STATUS_LABEL: Record<Exclude<StatusLevel, null>, string> = {
  CONFIRME: "Confirmé",
  A_SURVEILLER: "À surveiller",
};

const PREMIUM_DOMAINS = new Set([
  "cnbc.com",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "factset.com",
  "marketwatch.com",
]);

const SOURCE_TIME_OFFSETS = [23, 31, 44, 52, 18, 37, 55, 29] as const;

const MARKET_CONTEXT_MOCK = {
  variation: "S&P 500 +1,4 % | Nasdaq +1,9 % | Dow +0,8 %",
  breadth: "68 % des titres du S&P 500 en hausse",
  sectors: [
    { label: "Tech +2,4 %", up: true },
    { label: "Conso +1,8 %", up: true },
    { label: "Industrie +1,2 %", up: true },
    { label: "Immobilier −0,4 %", up: false },
  ],
  megacaps: [
    { ticker: "AAPL", delta: "+1,8 %" },
    { ticker: "MSFT", delta: "+2,3 %" },
    { ticker: "NVDA", delta: "+4,1 %" },
    { ticker: "AMZN", delta: "+1,2 %" },
    { ticker: "META", delta: "+2,7 %" },
  ],
} as const;

const TAKEAWAY_MOCK: Record<
  BulletinBias,
  { synthese: string; catalyseur: string; risque: string; confirmation: string }
> = {
  HAUSSIER: {
    synthese:
      "Les résultats T1 dépassent les attentes sur les méga-caps, alimentant un rally piloté par les bénéfices sur fond de Fed en pause.",
    catalyseur: "Surprise bénéficiaire Big Tech (EPS +12 % vs consensus)",
    risque: "Rebond de l'inflation PCE en avril, forçant un recalibrage hawkish",
    confirmation: "ISM manufacturier > 50 et NFP vendredi",
  },
  BAISSIER: {
    synthese:
      "La résilience du marché masque une détérioration des fondamentaux : marges comprimées, crédit sous tension et géopolitique qui s'envenime.",
    catalyseur: "Surprise négative sur les résultats bancaires (provisions en hausse)",
    risque: "Escalade géopolitique bloquant les chaînes d'approvisionnement énergétiques",
    confirmation: "Flash PMI services et confiance du consommateur Michigan",
  },
  MITIGE: {
    synthese:
      "Le marché oscille entre bonnes nouvelles micro et inquiétudes macro persistantes, sans direction claire à court terme.",
    catalyseur: "Décision Fed et ton du communiqué mercredi",
    risque: "Données d'inflation CPI supérieures aux attentes",
    confirmation: "Révisions de bénéfices T1 et guidance T2 des entreprises",
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getBulletImpact(category: BulletinCategory | null, index: number): ImpactLevel {
  if (category === "RESULTATS" || category === "FED") return "FORT";
  if (category === "MACRO" || category === "TECH" || category === "CREDIT") return "MOYEN";
  if (category === "GEO" || category === "MARCHE") return "FAIBLE";
  return index === 0 ? "FORT" : "FAIBLE";
}

function getBulletStatus(category: BulletinCategory | null): StatusLevel {
  if (category === "RESULTATS" || category === "CREDIT") return "CONFIRME";
  if (category === "MACRO" || category === "GEO") return "A_SURVEILLER";
  return null;
}

const IMPACT_ORDER: Record<ImpactLevel, number> = { FORT: 0, MOYEN: 1, FAIBLE: 2 };

// ─── COMPONENT ────────────────────────────────────────────────────────────────

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

  const [contextOpen, setContextOpen] = useState(false);

  const { refresh: aiRefresh } = ai;
  const refresh = useCallback(() => {
    setNowTick(Date.now());
    aiRefresh();
  }, [aiRefresh]);

  const freshnessLabel = ai.lastUpdatedAt
    ? `Mis à jour ${formatRelative(ai.lastUpdatedAt, nowTick)}`
    : null;

  const effectiveBias: BulletinBias = ai.headline.bias ?? "HAUSSIER";

  const annotatedBullets = ai.bullets.map((b, i) => ({
    ...b,
    impact: getBulletImpact(b.category, i),
    status: getBulletStatus(b.category),
    originalIndex: i,
  }));
  const sortedBullets = [...annotatedBullets].sort(
    (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact],
  );
  const takeaway = TAKEAWAY_MOCK[effectiveBias];

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

                  {ai.headline.text && !ai.loading && (
                    <div className="market-reading" aria-label="Lecture de marché">
                      <div className="market-reading-label">Lecture de marché</div>
                      <div className="market-reading-row">
                        <div className="market-reading-item">
                          <span className="market-reading-item-label">Biais du jour</span>
                          <span
                            className={`ai-bias-chip ai-bias-chip--${effectiveBias.toLowerCase()}`}
                          >
                            {BIAS_LABEL[effectiveBias]}
                          </span>
                        </div>
                        <div className="market-reading-item" style={{ flex: 1, minWidth: 120 }}>
                          <span className="market-reading-item-label">Driver principal</span>
                          <span className="market-reading-item-value">
                            {MARKET_READING_MOCK.driver}
                          </span>
                        </div>
                        <div className="market-reading-item conviction-bar-wrap">
                          <span className="market-reading-item-label">Score de conviction</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className="conviction-bar" style={{ flex: 1 }}>
                              <div
                                className="conviction-fill"
                                style={{ width: `${MARKET_READING_MOCK.conviction}%` }}
                                role="progressbar"
                                aria-valuenow={MARKET_READING_MOCK.conviction}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              />
                            </div>
                            <span className="conviction-score-label">
                              {MARKET_READING_MOCK.conviction}/100
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {sortedBullets.length > 0 ? (
                    <ul className="ai-bullets">
                      {sortedBullets.map((b) => {
                        const firstSource = ai.sources[0];
                        return (
                          <li key={`${b.originalIndex}-${b.text}`}>
                            {b.category && (
                              <span
                                className={`bullet-tag bullet-tag--${b.category.toLowerCase()}`}
                              >
                                {CATEGORY_LABEL[b.category]}
                              </span>
                            )}
                            <span
                              className={`bullet-impact bullet-impact--${b.impact.toLowerCase()}`}
                            >
                              {IMPACT_LABEL[b.impact]}
                            </span>
                            {b.status && (
                              <span
                                className={`bullet-status bullet-status--${b.status === "CONFIRME" ? "confirme" : "surveiller"}`}
                              >
                                {STATUS_LABEL[b.status]}
                              </span>
                            )}
                            <span className="bullet-text">{b.text}</span>
                            {firstSource && (
                              <a
                                className="bullet-source-link"
                                href={firstSource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Voir la source"
                                tabIndex={-1}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                >
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>
                            )}
                          </li>
                        );
                      })}
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

                  {sortedBullets.length > 0 && !ai.loading && (
                    <div className="market-context">
                      <button
                        className="market-context-toggle"
                        onClick={() => setContextOpen((v) => !v)}
                        aria-expanded={contextOpen}
                      >
                        <span aria-hidden="true">📊</span>
                        Contexte du marché
                        <span aria-hidden="true">{contextOpen ? "▴" : "▾"}</span>
                      </button>
                      <div className={`market-context-body${contextOpen ? " is-open" : ""}`}>
                        <div className="market-context-inner">
                          <div className="market-context-row">
                            <span className="market-context-row-label">Variation séance</span>
                            <span className="market-context-row-value">
                              {MARKET_CONTEXT_MOCK.variation}
                            </span>
                          </div>
                          <div className="market-context-row">
                            <span className="market-context-row-label">Breadth</span>
                            <span className="market-context-row-value">
                              {MARKET_CONTEXT_MOCK.breadth}
                            </span>
                          </div>
                          <div className="market-context-row">
                            <span className="market-context-row-label">Top secteurs</span>
                            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {MARKET_CONTEXT_MOCK.sectors.map((s) => (
                                <span
                                  key={s.label}
                                  className={`sector-pill sector-pill--${s.up ? "up" : "down"}`}
                                >
                                  {s.label}
                                </span>
                              ))}
                            </span>
                          </div>
                          <div className="market-context-row">
                            <span className="market-context-row-label">Mégacaps</span>
                            <div className="megacaps-scroll">
                              {MARKET_CONTEXT_MOCK.megacaps.map((m) => (
                                <div key={m.ticker} className="megacap-chip">
                                  <span className="megacap-chip-ticker">{m.ticker}</span>
                                  <span className="megacap-chip-delta">{m.delta}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {ai.sources.length > 0 ? (
                    <div className="ai-sources">
                      <span className="ai-sources-label">Sources</span>
                      <ul className="source-list">
                        {ai.sources.map((s, idx) => {
                          const host = hostname(s.url);
                          const isPremium = PREMIUM_DOMAINS.has(host);
                          const offsetMinutes =
                            SOURCE_TIME_OFFSETS[idx % SOURCE_TIME_OFFSETS.length];
                          const sourceTs = ai.lastUpdatedAt
                            ? ai.lastUpdatedAt - offsetMinutes * 60_000
                            : null;
                          const sourceTimeLabel = sourceTs
                            ? formatRelative(sourceTs, nowTick)
                            : null;
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
                                {isPremium && (
                                  <span className="source-premium-badge">Premium</span>
                                )}
                                {sourceTimeLabel && (
                                  <span className="source-time">{sourceTimeLabel}</span>
                                )}
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

                  {ai.sources.length > 0 && !ai.loading && (
                    <div
                      className={`takeaway-card takeaway-card--${effectiveBias.toLowerCase()}`}
                    >
                      <div>
                        <div className="takeaway-title">À retenir</div>
                        <p className="takeaway-synthese">{takeaway.synthese}</p>
                      </div>
                      <div className="takeaway-row">
                        <span className="takeaway-row-icon" aria-hidden="true">⚡</span>
                        <span className="takeaway-row-label">Catalyseur</span>
                        <span>{takeaway.catalyseur}</span>
                      </div>
                      <div className="takeaway-row">
                        <span className="takeaway-row-icon" aria-hidden="true">⚠</span>
                        <span className="takeaway-row-label">Risque</span>
                        <span>{takeaway.risque}</span>
                      </div>
                      <div className="takeaway-row">
                        <span className="takeaway-row-icon" aria-hidden="true">🔍</span>
                        <span className="takeaway-row-label">Confirmation</span>
                        <span>{takeaway.confirmation}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
