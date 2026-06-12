import { NFCI_THRESHOLDS, type SentimentState, type Thresholds } from "./types";

// Convention de bornes : une valeur exactement sur un seuil appartient à la
// catégorie la plus sereine. En miroir des paliers composites dont la borne
// basse est incluse (score ≥ from), un indicateur pile sur un seuil et son
// sous-score de sérénité (score.ts) tombent ainsi dans le même état.

export function classifyVix(
  v: number | null,
  t: Thresholds["vix"]
): SentimentState | null {
  if (v == null) return null;
  if (v <= t.euphorie) return "EUPHORIE";
  if (v <= t.calme) return "CALME";
  if (v <= t.stress) return "STRESS";
  return "PANIQUE";
}

export function classifyHyOas(
  v: number | null,
  t: Thresholds["oas"]
): SentimentState | null {
  if (v == null) return null;
  if (v <= t.euphorie) return "EUPHORIE";
  if (v <= t.calme) return "CALME";
  if (v <= t.stress) return "STRESS";
  return "PANIQUE";
}

export function classifyFg(
  v: number | null,
  t: Thresholds["fg"]
): SentimentState | null {
  if (v == null) return null;
  if (v < t.panique) return "PANIQUE";
  if (v < t.stress) return "STRESS";
  if (v < t.neutre) return "NEUTRE";
  if (v < t.calme) return "CALME";
  return "EUPHORIE";
}

export function classifyNfci(v: number | null): SentimentState | null {
  if (v == null) return null;
  if (v <= NFCI_THRESHOLDS.calme) return "EUPHORIE";
  if (v <= NFCI_THRESHOLDS.normal) return "NEUTRE";
  if (v <= NFCI_THRESHOLDS.stress) return "STRESS";
  return "PANIQUE";
}

export const STATE_LABELS: Record<SentimentState, string> = {
  EUPHORIE: "Euphorie",
  CALME: "Calme",
  NEUTRE: "Neutre",
  STRESS: "Stress",
  PANIQUE: "Panique",
};
