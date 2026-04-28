import { cached, fetchWithTimeout } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYMBOL = "%5EGSPC";
const TTL_MS = 10 * 60_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface Sp500Payload {
  points: Array<{ t: number; c: number }>;
  meta: { currency?: string; symbol?: string };
  source: string;
}

interface YahooChartResponse {
  chart?: {
    error?: { description?: string } | null;
    result?: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
      meta: { currency?: string; symbol?: string };
    }>;
  };
}

function parseYahoo(json: unknown, source: string): Sp500Payload {
  const j = json as YahooChartResponse;
  if (j.chart?.error) throw new Error(j.chart.error.description ?? "Yahoo error");
  const r = j.chart?.result?.[0];
  if (!r) throw new Error("Yahoo: format inattendu");

  const ts = r.timestamp;
  const closes = r.indicators.quote[0].close;
  const points: { t: number; c: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && !Number.isNaN(c)) points.push({ t: ts[i], c });
  }
  if (points.length === 0) throw new Error("Yahoo: 0 points");
  return { points, meta: r.meta, source };
}

async function loadSp500Raw(): Promise<Sp500Payload> {
  const period2 = Math.floor(Date.now() / 1000);
  const url1 = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&period1=0&period2=${period2}`;
  const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&period1=0&period2=${period2}`;

  const headers = {
    "User-Agent": BROWSER_UA,
    Accept: "application/json, text/plain, */*",
  };

  const tryFetch = async (url: string): Promise<Sp500Payload> => {
    const res = await fetchWithTimeout(url, { headers, cache: "no-store" }, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return parseYahoo(json, new URL(url).hostname);
  };

  // First success wins; ~8 s worst case instead of N × 10 s.
  return Promise.any([tryFetch(url1), tryFetch(url2)]);
}

export async function GET(): Promise<Response> {
  try {
    const payload = await cached("sp500", TTL_MS, loadSp500Raw);
    return Response.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
