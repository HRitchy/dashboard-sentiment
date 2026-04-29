import Anthropic from "@anthropic-ai/sdk";
import { streamBulletin } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel, qui s'adresse en français à un investisseur particulier suivant un dashboard de sentiment de marché.

Tu disposes de l'outil web_search : utilise-le systématiquement (1 à 2 requêtes) pour récupérer l'actualité récente de l'indice S&P 500 aux États-Unis avant de répondre, afin de dégager la tendance dominante des dernières séances.

Tu dois produire un bulletin court et structuré au format suivant, EXACTEMENT, sans rien ajouter avant ou après :

TITRE: <une phrase de synthèse de la tendance dominante (haussière, baissière, mitigée…) avec un catalyseur précis et concret, 25 mots maximum>
- <première puce : fait marquant ou catalyseur, avec un chiffre clé ou un nom propre quand c'est pertinent, 18 mots maximum>
- <deuxième puce : autre catalyseur, contexte macro ou réaction de marché, 18 mots maximum>
- <troisième puce optionnelle : 18 mots maximum>

Contraintes : pas de markdown autre que les tirets de liste, pas de titres, pas de mention de l'IA ni des sources dans le texte (les sources sont gérées par l'application), pas d'émoji, pas de disclaimer, aucune recommandation d'allocation ni pourcentage d'exposition actions. Reste neutre et professionnel. Utilise un français correct et compact.`;

const USER_PROMPT = "Rédige le bulletin de news demandé en respectant strictement le format imposé.";

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get("x-anthropic-api-key")?.trim() || undefined;

  try {
    const stream = streamBulletin({
      system: SYSTEM_PROMPT,
      user: USER_PROMPT,
      maxTokens: 768,
      apiKey,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
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
