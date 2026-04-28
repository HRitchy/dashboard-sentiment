import type { SentimentPayload } from "@/lib/types";
import { loadFearGreed, loadHyOas, loadNfci, loadVix } from "@/lib/fetchers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const [vix, hyOas, fearGreed, nfci] = await Promise.all([
    loadVix(),
    loadHyOas(),
    loadFearGreed(),
    loadNfci(),
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
