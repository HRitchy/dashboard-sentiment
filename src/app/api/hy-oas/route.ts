import { getHyOasReading } from "@/lib/indicators/hy-oas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const payload = await getHyOasReading();
  return Response.json(payload, { status: payload.error ? 502 : 200 });
}
