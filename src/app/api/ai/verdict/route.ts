import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/claude";
import { cached } from "@/lib/server-cache";
import { DEFAULT_THRESHOLDS, type SentimentPayload, type Thresholds } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `Tu es un assistant financier sobre et factuel, qui s'adresse en français à un investisseur particulier suivant un dashboard de sentiment de marché.

Tu disposes de l'outil web_search : utilise-le systématiquement (1 à 2 requêtes) pour récupérer l'actualité récente de la bourse mondiale (États-Unis, Europe, Asie) avant de répondre, afin de dégager la tendance dominante des dernières séances.

À partir des valeurs courantes des indicateurs (VIX, HY OAS, Fear & Greed, NFCI), des seuils utilisateur et de l'actualité boursière mondiale, écris exactement deux phrases courtes :
1. La première décrit l'état du marché en intégrant les valeurs précises et la convergence (ou divergence) des indicateurs ; reprends la valeur du NFCI exactement comme fournie, avec ses trois décimales, sans arrondi.
2. La seconde résume la tendance des marchés mondiaux d'après les actualités récentes (haussière, baissière, mitigée…) et cite éventuellement un fait marquant.

Contraintes : pas de listes, pas de markdown, pas de titres, pas de disclaimer, pas d'émoji, pas de mention de l'IA ni des sources, aucune recommandation d'allocation ni pourcentage d'exposition actions. Reste neutre et professionnel. Maximum 70 mots au total.`;
const PROMPT_VERSION = "v1";
const DAY_MS = 24 * 60 * 60 * 1000;

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
    `Rédige les deux phrases demandées.`,
  ].join("\n");
}

interface RequestBody {
  payload: SentimentPayload;
  thresholds?: Thresholds;
}

interface CachedVerdict {
  text: string;
  generatedAt: string;
}

function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function msUntilNextUtcMidnight(date = new Date()): number {
  const nextMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1_000, nextMidnight - date.getTime());
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
  const userPrompt = buildUserPrompt(body.payload, thresholds);
  const dayKey = utcDayKey();
  const thresholdKey = JSON.stringify(thresholds);
  const cacheKey = `ai:verdict:${PROMPT_VERSION}:${dayKey}:${thresholdKey}`;
  const now = new Date().toISOString();

  try {
    let cacheHit = true;
    const verdict = await cached<CachedVerdict>(
      cacheKey,
      Math.min(DAY_MS, msUntilNextUtcMidnight()),
      async () => {
        cacheHit = false;
        const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
        const resp = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 2,
            },
          ],
        });
        const text = resp.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("")
          .trim();
        return { text, generatedAt: now };
      },
    );

    return new Response(verdict.text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-ai-generated-at": verdict.generatedAt,
        "x-ai-cache-hit": String(cacheHit),
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
