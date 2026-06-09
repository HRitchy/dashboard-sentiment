"use client";

import type { SentimentState } from "@/lib/types";
import { STATE_LABELS } from "@/lib/classify";
import { SCORE_BANDS } from "@/lib/score";

interface Props {
  /** Indice composite 0–100, ou null si aucune donnée. */
  value: number | null;
  /** Palier courant (couleur du curseur / libellé actif). */
  state: SentimentState | null;
}

export default function ScoreBar({ value, state }: Props) {
  const stateW = state ? `w-${state.toLowerCase()}` : "";

  // Position du curseur en pourcentage (clampée à 0–100).
  const pct = value == null ? null : Math.max(0, Math.min(100, value));

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
    </div>
  );
}
