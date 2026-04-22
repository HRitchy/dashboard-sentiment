export type SentimentState = "EUPHORIE" | "CALME" | "NEUTRE" | "STRESS" | "PANIQUE";

export interface IndicatorReading {
  value: number | null;
  asOf: string | null; // ISO date
  source: string;
  error?: string;
}

export interface SentimentPayload {
  vix: IndicatorReading;
  hyOas: IndicatorReading;
  fearGreed: IndicatorReading;
  fetchedAt: string;
}

export interface Thresholds {
  vix: { euphorie: number; calme: number; stress: number };
  oas: { euphorie: number; calme: number; stress: number };
  fg: { panique: number; stress: number; neutre: number; calme: number };
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  vix: { euphorie: 15, calme: 20, stress: 30 },
  oas: { euphorie: 2.75, calme: 3.5, stress: 4.5 },
  fg: { panique: 25, stress: 45, neutre: 56, calme: 76 },
};
