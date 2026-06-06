// Indice composite 0–100 — un score numérique unique pondérant les 4
// indicateurs (VIX, HY OAS, Fear & Greed, NFCI).
//
// Chaque indicateur est d'abord ramené à un sous-score de « sérénité » sur
// 0–100, où 100 = euphorie (marché serein) et 0 = panique. La conversion est
// une interpolation linéaire par morceaux entre les seuils de classification,
// si bien que le score reste cohérent avec le verdict catégoriel et suit
// automatiquement les seuils réglés par l'utilisateur. Fear & Greed est déjà
// orienté « haut = serein » ; les trois autres sont inversés (une valeur
// élevée signale du stress).

import {
  FG_RANGE,
  NFCI_RANGE,
  NFCI_THRESHOLDS,
  OAS_RANGE,
  VIX_RANGE,
  type SentimentState,
  type Thresholds,
} from "./types";
import type { History, IndicatorKey } from "./history";

function clamp(x: number): number {
  return Math.max(0, Math.min(100, x));
}

// Interpolation linéaire par morceaux entre des points d'ancrage (triés par x).
function piecewise(v: number, pts: readonly (readonly [number, number])[]): number {
  if (v <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (v >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (v <= x1) {
      const t = (v - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

// VIX / HY OAS / NFCI : 3 seuils → 4 bandes, valeur élevée = panique.
// Ancrages de sérénité : min→100, b1→75, b2→50, b3→25, max→0.
function fourBandSerenity(
  v: number,
  min: number,
  b1: number,
  b2: number,
  b3: number,
  max: number,
): number {
  return clamp(
    piecewise(v, [
      [min, 100],
      [b1, 75],
      [b2, 50],
      [b3, 25],
      [max, 0],
    ]),
  );
}

export function vixSerenity(v: number | null, t: Thresholds["vix"]): number | null {
  if (v == null) return null;
  return fourBandSerenity(v, VIX_RANGE.min, t.euphorie, t.calme, t.stress, VIX_RANGE.max);
}

export function oasSerenity(v: number | null, t: Thresholds["oas"]): number | null {
  if (v == null) return null;
  return fourBandSerenity(v, OAS_RANGE.min, t.euphorie, t.calme, t.stress, OAS_RANGE.max);
}

export function nfciSerenity(v: number | null): number | null {
  if (v == null) return null;
  return fourBandSerenity(
    v,
    NFCI_RANGE.min,
    NFCI_THRESHOLDS.calme,
    NFCI_THRESHOLDS.normal,
    NFCI_THRESHOLDS.stress,
    NFCI_RANGE.max,
  );
}

// Fear & Greed : 4 seuils → 5 bandes, déjà orienté « haut = serein ».
// Ancrages : min→0, panique→20, stress→40, neutre→60, calme→80, max→100.
export function fgSerenity(v: number | null, t: Thresholds["fg"]): number | null {
  if (v == null) return null;
  return clamp(
    piecewise(v, [
      [FG_RANGE.min, 0],
      [t.panique, 20],
      [t.stress, 40],
      [t.neutre, 60],
      [t.calme, 80],
      [FG_RANGE.max, 100],
    ]),
  );
}

// Poids relatifs des indicateurs dans l'indice composite (par défaut égaux).
export const SCORE_WEIGHTS: Record<IndicatorKey, number> = {
  vix: 1,
  oas: 1,
  fg: 1,
  nfci: 1,
};

// Paliers de l'indice composite (source unique des bornes 0–100). Sert à la
// fois à la couleur du panneau (scoreToState) et à la jauge à paliers.
export interface ScoreBand {
  state: SentimentState;
  from: number;
  to: number;
}

export const SCORE_BANDS: readonly ScoreBand[] = [
  { state: "PANIQUE", from: 0, to: 20 },
  { state: "STRESS", from: 20, to: 40 },
  { state: "NEUTRE", from: 40, to: 60 },
  { state: "CALME", from: 60, to: 80 },
  { state: "EUPHORIE", from: 80, to: 100 },
];

// Mappe un score 0–100 vers un palier catégoriel (pour la couleur du panneau).
export function scoreToState(score: number): SentimentState {
  // Parcours du plus haut au plus bas : premier palier dont la borne basse est
  // atteinte. Garantit la cohérence avec SCORE_BANDS (source unique).
  for (let i = SCORE_BANDS.length - 1; i >= 0; i--) {
    if (score >= SCORE_BANDS[i].from) return SCORE_BANDS[i].state;
  }
  return "PANIQUE";
}

export interface CompositePart {
  key: IndicatorKey;
  serenity: number | null;
}

export interface CompositeResult {
  value: number | null; // 0–100 arrondi, null si aucun indicateur disponible
  state: SentimentState | null;
  parts: CompositePart[];
}

// Moyenne pondérée des sous-scores disponibles (les indicateurs manquants sont
// ignorés et les poids re-normalisés).
export function compositeScore(
  serenities: Record<IndicatorKey, number | null>,
  weights: Record<IndicatorKey, number> = SCORE_WEIGHTS,
): CompositeResult {
  const keys: IndicatorKey[] = ["vix", "oas", "fg", "nfci"];
  let acc = 0;
  let wsum = 0;
  for (const k of keys) {
    const s = serenities[k];
    if (s != null) {
      acc += s * weights[k];
      wsum += weights[k];
    }
  }
  const parts: CompositePart[] = keys.map((k) => ({ key: k, serenity: serenities[k] }));
  if (wsum === 0) return { value: null, state: null, parts };
  const value = Math.round(acc / wsum);
  return { value, state: scoreToState(value), parts };
}

// Reconstruit la série quotidienne de l'indice composite à partir de
// l'historique des indicateurs, en combinant les valeurs jour par jour. Les
// seuils courants sont appliqués (la série reflète donc toujours le réglage
// actuel) — l'indice devient ainsi pleinement historisable.
export function scoreSeries(history: History, thresholds: Thresholds): number[] {
  const byDay = new Map<string, Partial<Record<IndicatorKey, number>>>();
  const keys: IndicatorKey[] = ["vix", "oas", "fg", "nfci"];
  for (const k of keys) {
    for (const p of history[k]) {
      const e = byDay.get(p.d) ?? {};
      e[k] = p.v;
      byDay.set(p.d, e);
    }
  }
  const out: number[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const e = byDay.get(day)!;
    const { value } = compositeScore({
      vix: vixSerenity(e.vix ?? null, thresholds.vix),
      oas: oasSerenity(e.oas ?? null, thresholds.oas),
      fg: fgSerenity(e.fg ?? null, thresholds.fg),
      nfci: nfciSerenity(e.nfci ?? null),
    });
    if (value != null) out.push(value);
  }
  return out;
}
