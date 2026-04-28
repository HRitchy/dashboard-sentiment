import type { IndicatorReading } from "./types";
import { cached, fetchWithTimeout } from "./server-cache";

const VIX_TTL_MS = 30_000;
const FG_TTL_MS = 5 * 60_000;
const FRED_TTL_MS = 30 * 60_000;

const VIX_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1mo";

const FRED_KEY = process.env.FRED_API_KEY ?? "fb4ed430c2d9b95fa12563b9f0550421";

const HY_OAS_URL =
  "https://api.stlouisfed.org/fred/series/observations" +
  `?series_id=BAMLH0A0HYM2&api_key=${FRED_KEY}` +
  "&file_type=json&sort_order=desc&limit=40";

const NFCI_URL =
  "https://api.stlouisfed.org/fred/series/observations" +
  `?series_id=NFCI&api_key=${FRED_KEY}` +
  "&file_type=json&sort_order=desc&limit=30";

function buildCnnUrl(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${today}`;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function loadVixRaw(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(VIX_URL, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/plain, */*",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        meta?: { regularMarketPrice?: number };
      }>;
    };
  };

  const result = data.chart?.result?.[0];
  if (!result) throw new Error("Yahoo: empty result");

  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
    (x): x is number => typeof x === "number",
  );
  const timestamps = result.timestamp ?? [];

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
    source: "yfinance · ^VIX",
    history: closes.slice(-30),
  };
}

async function loadHyOasRaw(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(HY_OAS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);

  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };
  const clean = (data.observations ?? [])
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => Number.isFinite(o.value));
  if (clean.length === 0) throw new Error("FRED: no valid observations");

  const last = clean[0];
  // FRED returns desc; reverse to oldest → newest for sparkline.
  const history = clean
    .slice(0, 30)
    .map((o) => o.value)
    .reverse();
  return {
    value: last.value,
    asOf: new Date(last.date + "T00:00:00Z").toISOString(),
    source: "FRED · BAMLH0A0HYM2",
    history,
  };
}

async function loadFearGreedRaw(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(buildCnnUrl(), {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/plain, */*",
      Referer: "https://edition.cnn.com/markets/fear-and-greed",
      Origin: "https://edition.cnn.com",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CNN HTTP ${res.status}`);

  const data = (await res.json()) as {
    fear_and_greed?: { score: number; timestamp?: string };
    fear_and_greed_historical?: {
      data?: Array<{ x: number; y: number }>;
    };
  };
  const fg = data.fear_and_greed;
  if (!fg || typeof fg.score !== "number") throw new Error("CNN: malformed payload");

  const histRaw = data.fear_and_greed_historical?.data ?? [];
  const history = histRaw
    .filter((p) => typeof p.y === "number" && Number.isFinite(p.y))
    .slice(-30)
    .map((p) => Math.round(p.y * 100) / 100);

  return {
    value: Math.round(fg.score * 100) / 100,
    asOf: fg.timestamp ?? new Date().toISOString(),
    source: "CNN · Fear & Greed",
    history: history.length > 0 ? history : undefined,
  };
}

async function loadNfciRaw(): Promise<IndicatorReading> {
  const res = await fetchWithTimeout(NFCI_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);

  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };
  const clean = (data.observations ?? [])
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => Number.isFinite(o.value));
  if (clean.length === 0) throw new Error("FRED: no valid observations");

  const last = clean[0];
  const history = clean
    .slice(0, 30)
    .map((o) => o.value)
    .reverse();
  return {
    value: last.value,
    asOf: new Date(last.date + "T00:00:00Z").toISOString(),
    source: "FRED · NFCI",
    history,
  };
}

function emptyReading(source: string, error: string): IndicatorReading {
  return { value: null, asOf: null, source, error };
}

async function safeRead(
  key: string,
  ttl: number,
  source: string,
  loader: () => Promise<IndicatorReading>,
): Promise<IndicatorReading> {
  try {
    return await cached(key, ttl, loader);
  } catch (err) {
    return emptyReading(source, err instanceof Error ? err.message : String(err));
  }
}

export const loadVix = () =>
  safeRead("vix", VIX_TTL_MS, "yfinance · ^VIX", loadVixRaw);

export const loadHyOas = () =>
  safeRead("hy-oas", FRED_TTL_MS, "FRED · BAMLH0A0HYM2", loadHyOasRaw);

export const loadFearGreed = () =>
  safeRead("fear-greed", FG_TTL_MS, "CNN · Fear & Greed", loadFearGreedRaw);

export const loadNfci = () =>
  safeRead("nfci", FRED_TTL_MS, "FRED · NFCI", loadNfciRaw);
