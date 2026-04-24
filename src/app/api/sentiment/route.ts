import type { IndicatorReading, SentimentPayload } from "@/lib/types";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function emptyReading(source: string, error: string): IndicatorReading {
  return {
    value: null,
    asOf: null,
    source,
    error,
  };
}

async function fetchJson(url: string): Promise<IndicatorReading> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    // Each sub-route returns an IndicatorReading whether ok or not.
    return (await res.json()) as IndicatorReading;
  } catch (err) {
    return emptyReading(
      url,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function GET(): Promise<Response> {
  // Build absolute URL from the incoming request so the aggregator can call the
  // sibling route handlers on the same deployment.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = `${proto}://${host}`;

  const [vix, hyOas, fearGreed, nfci] = await Promise.all([
    fetchJson(`${origin}/api/vix`),
    fetchJson(`${origin}/api/hy-oas`),
    fetchJson(`${origin}/api/fear-greed`),
    fetchJson(`${origin}/api/nfci`),
  ]);

  const payload: SentimentPayload = {
    vix,
    hyOas,
    fearGreed,
    nfci,
    fetchedAt: new Date().toISOString(),
  };

  return Response.json(payload);
}
