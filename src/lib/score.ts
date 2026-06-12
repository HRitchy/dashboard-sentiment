// Indice composite 0–100 — un score numérique unique pondérant les 4
// indicateurs (VIX, HY OAS, Fear & Greed, NFCI).
//
// Chaque indicateur est d'abord ramené à un sous-score de « sérénité » sur
// 0–100, où 100 = euphorie (marché serein) et 0 = panique. La conversion est
// une interpolation linéaire par morceaux dont les ancrages placent chaque
// seuil de classification exactement sur une borne de palier composite
// (SCORE_BANDS) : un indicateur pile sur un seuil tombe dans le même état que
// son verdict catégoriel, et le sous-score suit automatiquement les seuils
// réglés par l'utilisateur. Les indicateurs à 4 catégories n'ont pas
// d'équivalent pour l'un des 5 paliers composites ; ce palier orphelin est
// traversé linéairement entre les deux seuils qui l'encadrent (voir les
// commentaires des fonctions). Fear & Greed est déjà orienté « haut = serein » ;
// les trois autres sont inversés (une valeur élevée signale du stress).

import {
  FG_RANGE,
  NFCI_RANGE,
  NFCI_THRESHOLDS,
  OAS_RANGE,
  VIX_RANGE,
  type SentimentState,
  type Thresholds,
} from "./types";

export type IndicatorKey = "vix" | "oas" | "fg" | "nfci";

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

// VIX / HY OAS : 4 catégories EUPHORIE/CALME/STRESS/PANIQUE (pas de NEUTRE),
// valeur élevée = panique. Ancrages sur les bornes des paliers composites :
// min→100, euphorie→80, calme→60, stress→20, max→0. Le palier NEUTRE (40–60),
// orphelin, est traversé linéairement entre les seuils calme et stress : une
// valeur à peine au-dessus du seuil calme lit NEUTRE avant STRESS.
function stressSerenity(
  v: number,
  min: number,
  t: { euphorie: number; calme: number; stress: number },
  max: number,
): number {
  return clamp(
    piecewise(v, [
      [min, 100],
      [t.euphorie, 80],
      [t.calme, 60],
      [t.stress, 20],
      [max, 0],
    ]),
  );
}

export function vixSerenity(v: number | null, t: Thresholds["vix"]): number | null {
  if (v == null) return null;
  return stressSerenity(v, VIX_RANGE.min, t, VIX_RANGE.max);
}

export function oasSerenity(v: number | null, t: Thresholds["oas"]): number | null {
  if (v == null) return null;
  return stressSerenity(v, OAS_RANGE.min, t, OAS_RANGE.max);
}

// NFCI : 4 catégories EUPHORIE/NEUTRE/STRESS/PANIQUE (pas de CALME).
// Ancrages : min→100, calme→80, normal→40, stress→20, max→0. Le palier CALME
// (60–80), orphelin, est traversé linéairement entre les seuils calme et
// normal.
export function nfciSerenity(v: number | null): number | null {
  if (v == null) return null;
  return clamp(
    piecewise(v, [
      [NFCI_RANGE.min, 100],
      [NFCI_THRESHOLDS.calme, 80],
      [NFCI_THRESHOLDS.normal, 40],
      [NFCI_THRESHOLDS.stress, 20],
      [NFCI_RANGE.max, 0],
    ]),
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

// Poids relatifs des indicateurs dans l'indice composite. Le Fear & Greed de
// CNN compte pour moitié : deux de ses sept composantes (volatilité ≈ VIX,
// demande d'obligations high yield ≈ HY OAS) recoupent des indicateurs déjà
// présents — un poids plein compterait ces axes deux fois.
export const SCORE_WEIGHTS: Record<IndicatorKey, number> = {
  vix: 1,
  oas: 1,
  fg: 0.5,
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
