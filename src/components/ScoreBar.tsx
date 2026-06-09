"use client";

import type { SentimentState } from "@/lib/types";
import { STATE_LABELS } from "@/lib/classify";
import { SCORE_BANDS } from "@/lib/score";

interface Props {
  /** Indice composite 0–100, ou null si aucune donnée. */
  value: number | null;
  /** Palier courant (couleur du curseur / libellé actif). */
  state: SentimentState | null;
  /** Valeurs quotidiennes (chronologiques) pour la sparkline + la tendance. */
  history: number[];
}

// Sparkline SVG de l'indice composite (valeurs quotidiennes récentes).
function ScoreSparkline({ values }: { values: number[] }) {
  const W = 120;
  const H = 34;
  const PAD = 3;
  const recent = values.slice(-30);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const span = max - min || 1;
  const n = recent.length;
  const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const d = recent
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      className="hero-score-spark"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-hidden="true"
    >
      <path d={d} fill="none" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(recent[n - 1])} r={2.4} />
    </svg>
  );
}

export default function ScoreBar({ value, state, history }: Props) {
  const stateW = state ? `w-${state.toLowerCase()}` : "";

  // Position du curseur en pourcentage (clampée à 0–100).
  const pct = value == null ? null : Math.max(0, Math.min(100, value));

  // Tendance vs. dernier relevé précédent (la veille dans le cas usuel).
  const trend =
    history.length >= 2
      ? (() => {
          const delta = history[history.length - 1] - history[history.length - 2];
          const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
          const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
          const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "▬";
          return { dir, arrow, label: `${sign}${Math.abs(delta)}` };
        })()
      : null;

  return (
    <div className="score-bar">
      <div
        className="score-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-label={`Indice de sérénité ${value ?? "indisponible"} sur 100`}
      >
        {SCORE_BANDS.map((b) => (
          <div
            key={b.state}
            className={`score-seg s-${b.state.toLowerCase()}${
              state === b.state ? " is-active" : ""
            }`}
          />
        ))}

        {pct != null && (
          <div className="score-cursor" style={{ left: `${pct}%` }}>
            <span className={`score-cursor-bubble ${stateW}`}>{value}</span>
            <span className="score-cursor-needle" />
          </div>
        )}
      </div>

      <div className="score-labels">
        {SCORE_BANDS.map((b) => (
          <span
            key={b.state}
            className={`score-label${state === b.state ? ` is-active ${stateW}` : ""}`}
          >
            {STATE_LABELS[b.state]}
          </span>
        ))}
      </div>

      {history.length >= 2 && (
        <div
          className="hero-score-foot"
          title="Évolution de l'indice depuis le relevé précédent"
        >
          <ScoreSparkline values={history} />
          {trend ? (
            <span className={`trend-chip trend-${trend.dir}`}>
              <span className="trend-arrow">{trend.arrow}</span>
              {trend.label}
              <span className="trend-since">veille</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
