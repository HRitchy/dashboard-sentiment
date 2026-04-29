import type { IndicatorReading } from "@/lib/types";
import { cached, fetchWithTimeout } from "@/lib/server-cache";

const YF_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d";

const TTL_MS = 30_000;
const SOURCE = "yfinance · ^VIX";

async function loadVix(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(YF_URL, {
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

  const asOf =
    timestamps.length > 0
      ? new Date(timestamps[timestamps.length - 1] * 1000).toISOString()
      : new Date().toISOString();

  return {
    value: last,
    asOf,
    source: SOURCE,
  };
}

export async function getVixReading(): Promise<IndicatorReading> {
  try {
    return await cached("vix", TTL_MS, loadVix);
  } catch (err) {
    return {
      value: null,
      asOf: null,
      source: SOURCE,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
