import type { IndicatorReading } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Yahoo Finance v8 chart endpoint — returns the last close for ^VIX.
// We request the last 5 daily bars to easily derive the previous close & delta.
const YF_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d";

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(YF_URL, {
      headers: {
        // Yahoo blocks most default fetch UAs.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Yahoo HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
          meta?: { regularMarketPrice?: number };
        }>;
        error?: { description?: string } | null;
      };
    };

    const result = data.chart?.result?.[0];
    if (!result) throw new Error("Yahoo: empty result");

    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
      (x): x is number => typeof x === "number"
    );
    const timestamps = result.timestamp ?? [];

    // Prefer the live regularMarketPrice for the latest value when markets open.
    const live = result.meta?.regularMarketPrice;
    const last =
      typeof live === "number" ? live : (closes[closes.length - 1] ?? null);
    const previous = closes[closes.length - 2] ?? null;
    const delta =
      last != null && previous != null ? +(last - previous).toFixed(2) : null;

    const asOf =
      timestamps.length > 0
        ? new Date(timestamps[timestamps.length - 1] * 1000).toISOString()
        : new Date().toISOString();

    const payload: IndicatorReading = {
      value: last,
      previous,
      delta,
      asOf,
      source: "yfinance · ^VIX",
    };

    return Response.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const payload: IndicatorReading = {
      value: null,
      previous: null,
      delta: null,
      asOf: null,
      source: "yfinance · ^VIX",
      error: msg,
    };
    return Response.json(payload, { status: 502 });
  }
}
