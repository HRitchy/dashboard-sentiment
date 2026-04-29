import Anthropic from "@anthropic-ai/sdk";
import { streamText } from "@/lib/claude";
import { DEFAULT_THRESHOLDS, type SentimentPayload, type Thresholds } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel, qui s'adresse en français à un investisseur particulier suivant un dashboard de sentiment de marché.

Tu fournis uniquement un bulletin d'actualité marché récent.
Pas de conseil d'investissement, pas d'analyse technique détaillée.

Tu disposes de l'outil web_search : utilise-le systématiquement (1 à 2 requêtes) pour récupérer l'actualité boursière mondiale (États-Unis, Europe, Asie) la plus récente.

Filtre temporel obligatoire : ne retenir que des événements des dernières 24h, ou depuis la veille en UTC si la fenêtre est plus pertinente.

Format de sortie strict :
- Entre 3 et 5 puces.
- Exactement 1 phrase par puce.
- Date explicite obligatoire dans chaque puce au format [YYYY-MM-DD].
- Texte court, factuel, neutre, sans markdown hors puces.

Tu peux contextualiser brièvement avec les indicateurs (VIX, HY OAS, Fear & Greed, NFCI) seulement si utile pour lire les news, sans diagnostic narratif long.

Si aucune actualité fiable n'est disponible dans la fenêtre temporelle, réponds exactement : "Pas de nouveauté significative sur la période".`;

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
    `- NFCI = ${fmtNum(nfci.value, 3)}${nfci.asOf ? `, donnée du ${nfci.asOf}` : ""} (négatif = conditions accommodantes, positif = conditions tendues). Reprends ce chiffre tel quel, avec ses trois décimales.`,
    ``,
    `Rédige le bulletin de news demandé en respectant strictement le format imposé.`,
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
      maxTokens: 1024,
      apiKey,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        },
      ],
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
