import type { IndicatorReading } from "@/lib/types";
import { cached, fetchWithTimeout } from "@/lib/server-cache";

// FRED — ICE BofA US High Yield Index Option-Adjusted Spread (daily).
// Fetch a bit more than 1 point so we can skip FRED's "." placeholder values.
const FRED_URL =
  "https://api.stlouisfed.org/fred/series/observations" +
  "?series_id=BAMLH0A0HYM2" +
  "&api_key=" +
  (process.env.FRED_API_KEY ?? "fb4ed430c2d9b95fa12563b9f0550421") +
  "&file_type=json&sort_order=desc&limit=10";

const TTL_MS = 30 * 60_000;
const SOURCE = "FRED · BAMLH0A0HYM2";

async function loadHyOas(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(FRED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);

  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };

  const observations = data.observations ?? [];
  // Keep only points with a real numeric value ("." is FRED's missing flag).
  const clean = observations
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => Number.isFinite(o.value));

  if (clean.length === 0) throw new Error("FRED: no valid observations");

  const last = clean[0];

  return {
    value: last.value,
    asOf: new Date(last.date + "T00:00:00Z").toISOString(),
    source: SOURCE,
  };
}

export async function getHyOasReading(): Promise<IndicatorReading> {
  try {
    return await cached("hy-oas", TTL_MS, loadHyOas);
  } catch (err) {
    return {
      value: null,
      asOf: null,
      source: SOURCE,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
