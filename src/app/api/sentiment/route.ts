import type { SentimentPayload } from "@/lib/types";
import { getFearGreedReading } from "@/lib/indicators/fear-greed";
import { getHyOasReading } from "@/lib/indicators/hy-oas";
import { getNfciReading } from "@/lib/indicators/nfci";
import { getVixReading } from "@/lib/indicators/vix";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const [vix, hyOas, fearGreed, nfci] = await Promise.all([
    getVixReading(),
    getHyOasReading(),
    getFearGreedReading(),
    getNfciReading(),
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
