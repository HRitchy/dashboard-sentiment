import type { SentimentState, Thresholds } from "./types";

export function classifyVix(
  v: number | null,
  t: Thresholds["vix"]
): SentimentState | null {
  if (v == null) return null;
  if (v < t.euphorie) return "EUPHORIE";
  if (v <= t.calme) return "CALME";
  if (v <= t.stress) return "STRESS";
  return "PANIQUE";
}

export function classifyHyOas(
  v: number | null,
  t: Thresholds["oas"]
): SentimentState | null {
  if (v == null) return null;
  if (v < t.euphorie) return "EUPHORIE";
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

export function convergence(
  states: (SentimentState | null)[]
): { state: SentimentState | null; count: number } {
  const counts: Partial<Record<SentimentState, number>> = {};
  for (const s of states) {
    if (s && s !== "NEUTRE") counts[s] = (counts[s] ?? 0) + 1;
  }
  let winner: SentimentState | null = null;
  let max = 0;
  for (const [k, v] of Object.entries(counts) as [SentimentState, number][]) {
    if (v > max) {
      max = v;
      winner = k;
    }
  }
  if (max >= 2) return { state: winner, count: max };
  return { state: null, count: max };
}

export const STATE_LABELS: Record<SentimentState, string> = {
  EUPHORIE: "Euphorie",
  CALME: "Calme",
  NEUTRE: "Neutre",
  STRESS: "Stress",
  PANIQUE: "Panique",
};

export type TradingSignal = "ACHETER" | "VENDRE";

export const STATE_SIGNALS: Record<SentimentState, TradingSignal | null> = {
  EUPHORIE: "VENDRE",
  CALME: "VENDRE",
  NEUTRE: null,
  STRESS: "ACHETER",
  PANIQUE: "ACHETER",
};

export const SIGNAL_LABELS: Record<TradingSignal, string> = {
  ACHETER: "Acheter",
  VENDRE: "Vendre",
};
