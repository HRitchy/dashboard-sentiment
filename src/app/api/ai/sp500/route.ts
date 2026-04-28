import Anthropic from "@anthropic-ai/sdk";
import { streamText } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel qui commente le S&P 500 en français pour un investisseur particulier.

À partir des statistiques fournies (dernière clôture, moyennes mobiles 50 et 200 jours, variations YTD, 1 an, 5 ans), écris exactement deux phrases courtes :
1. La première situe la cotation par rapport à ses moyennes mobiles (au-dessus / en-dessous, golden cross, death cross, etc.).
2. La seconde résume la dynamique récente avec les variations chiffrées les plus parlantes.

Contraintes : pas de listes, pas de markdown, pas de prédiction, pas de disclaimer, pas d'émoji, ton factuel. Maximum 50 mots au total.`;

interface Sp500Stats {
  lastClose: number | null;
  lastDate: string | null;
  ma50: number | null;
  ma200: number | null;
  ytdPct: number | null;
  oneYearPct: number | null;
  fiveYearPct: number | null;
}

interface RequestBody {
  stats: Sp500Stats;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "indisponible";
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "indisponible";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function buildUserPrompt(s: Sp500Stats): string {
  return [
    `Statistiques S&P 500 :`,
    `- Dernière clôture : ${fmtPrice(s.lastClose)}${s.lastDate ? ` (${s.lastDate})` : ""}.`,
    `- Moyenne mobile 50 jours : ${fmtPrice(s.ma50)}.`,
    `- Moyenne mobile 200 jours : ${fmtPrice(s.ma200)}.`,
    `- Variation YTD : ${fmtPct(s.ytdPct)}.`,
    `- Variation 1 an : ${fmtPct(s.oneYearPct)}.`,
    `- Variation 5 ans : ${fmtPct(s.fiveYearPct)}.`,
    ``,
    `Rédige les deux phrases demandées.`,
  ].join("\n");
}

export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  if (!body?.stats) {
    return Response.json({ error: "Champ 'stats' manquant." }, { status: 400 });
  }

  try {
    const stream = streamText({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(body.stats),
      maxTokens: 256,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "Clé ANTHROPIC_API_KEY manquante ou invalide." },
        { status: 500 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Limite de requêtes Claude atteinte, réessaie dans un instant." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json({ error: `Erreur API Claude (${err.status}).` }, { status: 502 });
    }
    return Response.json({ error: "Erreur inattendue." }, { status: 500 });
  }
}
