import type { IndicatorReading } from "@/lib/types";
import { cached, fetchWithTimeout } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// FRED — Chicago Fed National Financial Conditions Index (weekly).
// NFCI is released on Wednesdays and can publish a "." placeholder, so we
// fetch several recent observations and keep the most recent numeric one.
const FRED_URL =
  "https://api.stlouisfed.org/fred/series/observations" +
  "?series_id=NFCI" +
  "&api_key=" +
  (process.env.FRED_API_KEY ?? "fb4ed430c2d9b95fa12563b9f0550421") +
  "&file_type=json&sort_order=desc&limit=10";

const TTL_MS = 30 * 60_000;

async function loadNfci(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(FRED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);

  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };

  const clean = (data.observations ?? [])
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => Number.isFinite(o.value));

  if (clean.length === 0) throw new Error("FRED: no valid observations");

  const last = clean[0];

  return {
    value: last.value,
    asOf: new Date(last.date + "T00:00:00Z").toISOString(),
    source: "FRED · NFCI",
  };
}

export async function GET(): Promise<Response> {
  try {
    const payload = await cached("nfci", TTL_MS, loadNfci);
    return Response.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const payload: IndicatorReading = {
      value: null,
      asOf: null,
      source: "FRED · NFCI",
      error: msg,
    };
    return Response.json(payload, { status: 502 });
  }
}
