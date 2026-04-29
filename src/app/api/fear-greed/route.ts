import { getFearGreedReading } from "@/lib/indicators/fear-greed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const payload = await getFearGreedReading();
  return Response.json(payload, { status: payload.error ? 502 : 200 });
}
