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
  nfci: IndicatorReading;
  fetchedAt: string;
}

export const NFCI_THRESHOLDS = {
  calme: -0.5, // < -0.5 → Calme
  normal: 0,   // -0.5 ≤ x < 0 → Normal
  stress: 0.5, // 0 ≤ x < 0.5 → Stress ; x ≥ 0.5 → Crise
} as const;

export const NFCI_RANGE = { min: -2, max: 4 } as const;

// Plages d'affichage des jauges (bornes min/max des speedometers).
export const VIX_RANGE = { min: 0, max: 50 } as const;
export const OAS_RANGE = { min: 2, max: 10 } as const;
export const FG_RANGE = { min: 0, max: 100 } as const;

export interface Thresholds {
  vix: { euphorie: number; calme: number; stress: number };
  oas: { euphorie: number; calme: number; stress: number };
  fg: { panique: number; stress: number; neutre: number; calme: number };
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  vix: { euphorie: 15, calme: 25, stress: 30 },
  oas: { euphorie: 3, calme: 4, stress: 5 },
  fg: { panique: 25, stress: 45, neutre: 55, calme: 75 },
};
