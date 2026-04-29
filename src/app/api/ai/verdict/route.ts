import Anthropic from "@anthropic-ai/sdk";
import { streamText } from "@/lib/claude";
import { DEFAULT_THRESHOLDS, type SentimentPayload, type Thresholds } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel, qui s'adresse en français à un investisseur particulier suivant un dashboard de sentiment de marché.

À partir des valeurs courantes des indicateurs (VIX, HY OAS, Fear & Greed, NFCI) et des seuils choisis par l'utilisateur, écris exactement deux phrases courtes :
1. La première décrit l'état du marché en intégrant les valeurs précises et la convergence (ou divergence) des indicateurs.
2. La seconde donne une recommandation d'allocation actions concrète (par exemple un pourcentage cible) cohérente avec ces valeurs et avec les seuils.

Contraintes : pas de listes, pas de markdown, pas de titres, pas de disclaimer, pas d'émoji, pas de mention de l'IA. Reste neutre et professionnel. Maximum 60 mots au total.`;

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "indisponible";
  return v.toFixed(digits);
}

function buildUserPrompt(payload: SentimentPayload, thresholds: Thresholds): string {
  const { vix, hyOas, fearGreed, nfci } = payload;
  return [
    `Indicateurs actuels :`,
    `- VIX = ${fmtNum(vix.value, 2)} (seuils utilisateur : euphorie<${thresholds.vix.euphorie}, calme≤${thresholds.vix.calme}, stress≤${thresholds.vix.stress}, panique au-dessus).`,
    `- HY OAS = ${fmtNum(hyOas.value, 2)}% (seuils : euphorie<${thresholds.oas.euphorie}, calme≤${thresholds.oas.calme}, stress≤${thresholds.oas.stress}, panique au-dessus)${hyOas.asOf ? `, donnée du ${hyOas.asOf}` : ""}.`,
    `- Fear & Greed = ${fmtNum(fearGreed.value, 0)}/100 (seuils : panique<${thresholds.fg.panique}, stress<${thresholds.fg.stress}, neutre<${thresholds.fg.neutre}, calme<${thresholds.fg.calme}, euphorie au-dessus).`,
    `- NFCI = ${fmtNum(nfci.value, 2)}${nfci.asOf ? `, donnée du ${nfci.asOf}` : ""} (négatif = conditions accommodantes, positif = conditions tendues).`,
    ``,
    `Rédige les deux phrases demandées.`,
  ].join("\n");
}

interface RequestBody {
  payload: SentimentPayload;
  thresholds?: Thresholds;
}

export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  if (!body?.payload) {
    return Response.json({ error: "Champ 'payload' manquant." }, { status: 400 });
  }

  const thresholds = body.thresholds ?? DEFAULT_THRESHOLDS;
  const apiKey = req.headers.get("x-anthropic-api-key")?.trim() || undefined;

  try {
    const stream = streamText({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(body.payload, thresholds),
      maxTokens: 256,
      apiKey,
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
