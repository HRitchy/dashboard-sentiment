import type { IndicatorReading } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// FRED — ICE BofA US High Yield Index Option-Adjusted Spread (daily).
// Fetch a bit more than 2 points so we can skip FRED's "." placeholder values.
const FRED_URL =
  "https://api.stlouisfed.org/fred/series/observations" +
  "?series_id=BAMLH0A0HYM2" +
  "&api_key=" +
  (process.env.FRED_API_KEY ?? "fb4ed430c2d9b95fa12563b9f0550421") +
  "&file_type=json&sort_order=desc&limit=10";

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(FRED_URL, { cache: "no-store" });
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
    const previous = clean[1];
    const delta =
      previous != null ? +(last.value - previous.value).toFixed(2) : null;

    const payload: IndicatorReading = {
      value: last.value,
      previous: previous?.value ?? null,
      delta,
      asOf: new Date(last.date + "T00:00:00Z").toISOString(),
      source: "FRED · BAMLH0A0HYM2",
    };

    return Response.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const payload: IndicatorReading = {
      value: null,
      previous: null,
      delta: null,
      asOf: null,
      source: "FRED · BAMLH0A0HYM2",
      error: msg,
    };
    return Response.json(payload, { status: 502 });
  }
}
