import Anthropic from "@anthropic-ai/sdk";
import { streamText } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel, qui s'adresse en français à un investisseur particulier suivant un dashboard de sentiment de marché.

Tu disposes de l'outil web_search : utilise-le systématiquement (1 à 2 requêtes) pour récupérer l'actualité récente de l'indice S&P 500 aux États-Unis avant de répondre, afin de dégager la tendance dominante des dernières séances.

À partir de l'actualité boursière américaine, écris exactement une phrase qui résume la tendance du S&P 500 d'après les actualités récentes (haussière, baissière, mitigée…) et cite obligatoirement un fait marquant ou un catalyseur précis.

Contraintes : pas de listes, pas de markdown, pas de titres, pas de disclaimer, pas d'émoji, pas de mention de l'IA ni des sources, aucune recommandation d'allocation ni pourcentage d'exposition actions. Reste neutre et professionnel. Maximum 70 mots au total.`;

const USER_PROMPT = "Rédige le bulletin de news demandé en respectant strictement le format imposé.";

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get("x-anthropic-api-key")?.trim() || undefined;

  try {
    const stream = streamText({
      system: SYSTEM_PROMPT,
      user: USER_PROMPT,
      maxTokens: 256,
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
