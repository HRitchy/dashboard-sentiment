import Anthropic from "@anthropic-ai/sdk";
import { streamBulletin } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel, qui s'adresse en français à un investisseur particulier suivant un dashboard de sentiment de marché.

Tu disposes de l'outil web_search : utilise-le systématiquement (1 à 2 requêtes) pour récupérer l'actualité récente de l'indice S&P 500 aux États-Unis avant de répondre, afin de dégager la tendance dominante des dernières séances.

Tu dois produire un bulletin court et structuré au format suivant, EXACTEMENT, sans rien ajouter avant ou après :

TITRE [HAUSSIER|BAISSIER|MITIGE]: <une phrase de synthèse de la tendance dominante avec un catalyseur précis et concret, 25 mots maximum>
- [Macro|Fed|Resultats|Geo|Tech|Credit|Marche] <première puce : fait marquant ou catalyseur, avec un chiffre clé ou un nom propre quand c'est pertinent, 18 mots maximum>
- [Macro|Fed|Resultats|Geo|Tech|Credit|Marche] <deuxième puce : autre catalyseur, contexte macro ou réaction de marché, 18 mots maximum>
- [Macro|Fed|Resultats|Geo|Tech|Credit|Marche] <troisième puce optionnelle : 18 mots maximum>

Le tag entre crochets après TITRE doit être exactement HAUSSIER, BAISSIER ou MITIGE (sans accent, en majuscules), choisi selon le biais dominant. Le tag entre crochets en tête de chaque puce doit être l'une des sept catégories listées (Macro, Fed, Resultats, Geo, Tech, Credit, Marche), choisie selon le thème principal de la puce. Catégories : Macro = inflation, croissance, emploi ; Fed = politique monétaire, taux ; Resultats = earnings d'entreprises ; Geo = géopolitique, élections ; Tech = secteur tech, IA ; Credit = obligations, spreads, crédit ; Marche = flux, positionnement, réaction de marché.

Contraintes : pas de markdown autre que les tirets de liste et les crochets de tags, pas de titres, pas de mention de l'IA ni des sources dans le texte (les sources sont gérées par l'application), pas d'émoji, pas de disclaimer, aucune recommandation d'allocation ni pourcentage d'exposition actions. Reste neutre et professionnel. Utilise un français correct et compact.`;

const SENTIMENT_LABEL: Record<string, string> = {
  EUPHORIE: "euphorie (marché très optimiste)",
  CALME: "calme (marché serein)",
  NEUTRE: "neutre",
  STRESS: "stress (tension visible)",
  PANIQUE: "panique (aversion au risque marquée)",
};

interface VerdictBody {
  sentiment?: string;
  indicators?: {
    vix?: number | null;
    hyOas?: number | null;
    fearGreed?: number | null;
    nfci?: number | null;
  };
}

function buildUserPrompt(body: VerdictBody | null): string {
  const base =
    "Rédige le bulletin de news demandé en respectant strictement le format imposé.";
  if (!body) return base;

  const lines: string[] = [];
  const sentiment = typeof body.sentiment === "string" ? body.sentiment.toUpperCase() : null;
  if (sentiment && SENTIMENT_LABEL[sentiment]) {
    lines.push(`- État de sentiment global du dashboard : ${SENTIMENT_LABEL[sentiment]}.`);
  }
  const ind = body.indicators ?? {};
  const indicatorParts: string[] = [];
  if (typeof ind.vix === "number") indicatorParts.push(`VIX ${ind.vix.toFixed(2)}`);
  if (typeof ind.hyOas === "number") indicatorParts.push(`HY OAS ${ind.hyOas.toFixed(2)} %`);
  if (typeof ind.fearGreed === "number")
    indicatorParts.push(`Fear & Greed ${Math.round(ind.fearGreed)}`);
  if (typeof ind.nfci === "number") indicatorParts.push(`NFCI ${ind.nfci.toFixed(2)}`);
  if (indicatorParts.length > 0) {
    lines.push(`- Indicateurs courants : ${indicatorParts.join(" · ")}.`);
  }
  if (lines.length === 0) return base;
  return [
    base,
    "",
    "Contexte du dashboard (à intégrer si pertinent, sans le citer explicitement) :",
    ...lines,
  ].join("\n");
}

async function readBody(req: Request): Promise<VerdictBody | null> {
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object") return raw as VerdictBody;
  } catch {
    /* corps absent ou invalide, on ignore */
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get("x-anthropic-api-key")?.trim() || undefined;
  const body = await readBody(req);
  const userPrompt = buildUserPrompt(body);

  try {
    const stream = streamBulletin({
      system: SYSTEM_PROMPT,
      user: userPrompt,
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
