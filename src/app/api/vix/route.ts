import { getVixReading } from "@/lib/indicators/vix";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const payload = await getVixReading();
  return Response.json(payload, { status: payload.error ? 502 : 200 });
}
