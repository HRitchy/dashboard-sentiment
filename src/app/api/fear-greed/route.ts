import type { IndicatorReading } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// CNN's internal Fear & Greed JSON endpoint — requires a date path (today's date works).
// Returns `{ fear_and_greed: { score, ... } }`.
function buildCnnUrl(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${today}`;
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(buildCnnUrl(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://edition.cnn.com/markets/fear-and-greed",
        Origin: "https://edition.cnn.com",
      },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`CNN HTTP ${res.status}`);

    const data = (await res.json()) as {
      fear_and_greed?: {
        score: number;
        timestamp?: string;
      };
    };

    const fg = data.fear_and_greed;
    if (!fg || typeof fg.score !== "number") {
      throw new Error("CNN: malformed payload");
    }

    const value = Math.round(fg.score * 100) / 100;

    const payload: IndicatorReading = {
      value,
      asOf: fg.timestamp ?? new Date().toISOString(),
      source: "CNN · Fear & Greed",
    };

    return Response.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const payload: IndicatorReading = {
      value: null,
      asOf: null,
      source: "CNN · Fear & Greed",
      error: msg,
    };
    return Response.json(payload, { status: 502 });
  }
}
