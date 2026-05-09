const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const SEARCH_MODEL = "perplexity/sonar-pro";
export const STRUCTURING_MODEL = "qwen/qwen3-235b-a22b:free";
export const DEFAULT_MODEL = STRUCTURING_MODEL;

export const OPENROUTER_PIPELINE = [
  {
    id: SEARCH_MODEL,
    label: "Perplexity Sonar Pro",
    role: "Recherche web en temps réel avec citations",
  },
  {
    id: STRUCTURING_MODEL,
    label: "Qwen 3 235B (gratuit)",
    role: "Traitement et structuration de la réponse",
  },
] as const;

export const OPENROUTER_MODELS = OPENROUTER_PIPELINE;

export type OpenRouterModelId = (typeof OPENROUTER_MODELS)[number]["id"];

export class OpenRouterError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

const encoder = new TextEncoder();

async function resolveKey(apiKey?: string): Promise<string> {
  return apiKey || process.env.OPENROUTER_API_KEY || "";
}

async function throwOnBadStatus(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) {
    throw new OpenRouterError(res.status, "Clé OpenRouter manquante ou invalide.");
  }
  if (res.status === 429) {
    throw new OpenRouterError(429, "Limite de requêtes atteinte, réessaie dans un instant.");
  }
  throw new OpenRouterError(res.status, `Erreur API OpenRouter (${res.status}): ${body}`);
}


interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: unknown;
    };
  }>;
  citations?: unknown;
  search_results?: unknown;
}

interface SearchResult {
  content: string;
  sources: BulletinSource[];
}

async function createChatCompletion({
  system,
  user,
  maxTokens,
  apiKey,
  model,
}: {
  system: string;
  user: string;
  maxTokens: number;
  apiKey?: string;
  model: string;
}): Promise<ChatCompletionResponse> {
  const key = await resolveKey(apiKey);
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!res.ok) await throwOnBadStatus(res);
  return (await res.json()) as ChatCompletionResponse;
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function addSource(
  map: Map<string, BulletinSource>,
  url: unknown,
  title?: unknown,
) {
  if (typeof url !== "string") return;
  const trimmedUrl = url.trim();
  if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) return;
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!map.has(trimmedUrl)) {
    map.set(trimmedUrl, {
      url: trimmedUrl,
      title: trimmedTitle || titleFromUrl(trimmedUrl),
    });
  }
}

function collectSourceCandidates(value: unknown, map: Map<string, BulletinSource>) {
  if (!value) return;
  if (typeof value === "string") {
    addSource(map, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceCandidates(item, map));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  addSource(
    map,
    obj.url ?? obj.link ?? obj.source_url ?? obj.citation_url,
    obj.title ?? obj.name ?? obj.source ?? obj.hostname,
  );

  if (obj.url_citation && typeof obj.url_citation === "object") {
    collectSourceCandidates(obj.url_citation, map);
  }
  if (obj.citation && typeof obj.citation === "object") {
    collectSourceCandidates(obj.citation, map);
  }
}

function extractSources(data: ChatCompletionResponse, content: string): BulletinSource[] {
  const map = new Map<string, BulletinSource>();
  collectSourceCandidates(data.citations, map);
  collectSourceCandidates(data.search_results, map);
  for (const choice of data.choices ?? []) {
    collectSourceCandidates(choice.message?.annotations, map);
  }

  for (const match of content.matchAll(/https?:\/\/[^\s)\]}>"']+/gi)) {
    addSource(map, match[0].replace(/[.,;:]+$/, ""));
  }

  return Array.from(map.values()).slice(0, 8);
}

async function researchWithSonarPro({
  user,
  apiKey,
}: {
  user: string;
  apiKey?: string;
}): Promise<SearchResult> {
  const data = await createChatCompletion({
    system: [
      "Tu es un analyste de recherche financière.",
      "Effectue une recherche web en temps réel sur les catalyseurs les plus récents du S&P 500 et des marchés américains.",
      "Réponds en français avec des faits datés, des chiffres clés, et des citations/sources vérifiables.",
      "N'invente aucune donnée : si une information n'est pas confirmée par les sources, écarte-la.",
    ].join(" "),
    user: [
      user,
      "",
      "Retourne une synthèse de recherche factuelle et les sources utilisées.",
    ].join("\n"),
    maxTokens: 2200,
    apiKey,
    model: SEARCH_MODEL,
  });
  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, sources: extractSources(data, content) };
}

function buildStructuringPrompt(user: string, research: SearchResult): string {
  const sources = research.sources.length
    ? research.sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n")
    : "Aucune source structurée retournée par l'API ; conserve uniquement les faits cités dans la recherche.";

  return [
    "Transforme la recherche web ci-dessous en bulletin final en respectant strictement le format demandé par le système.",
    "Utilise uniquement les faits présents dans la recherche Sonar Pro et le contexte dashboard fourni.",
    "Ne mentionne pas les sources dans les puces : elles seront affichées séparément par l'application.",
    "",
    "Contexte utilisateur :",
    user,
    "",
    "Recherche Sonar Pro :",
    research.content || "Recherche vide.",
    "",
    "Sources détectées :",
    sources,
  ].join("\n");
}

function parseSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

export function streamText({
  system,
  user,
  maxTokens = 1024,
  apiKey,
  model = DEFAULT_MODEL,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  apiKey?: string;
  model?: string;
}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const key = await resolveKey(apiKey);
        const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: maxTokens,
            stream: true,
          }),
        });

        if (!res.ok) await throwOnBadStatus(res);
        if (!res.body) throw new Error("Réponse sans corps.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const text = parseSseLine(line);
              if (text) controller.enqueue(encoder.encode(text));
            }
          }
        }
        const tail = decoder.decode();
        if (tail) {
          for (const line of tail.split("\n")) {
            const text = parseSseLine(line);
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export interface BulletinSource {
  url: string;
  title: string;
}

export type BulletinBias = "HAUSSIER" | "BAISSIER" | "MITIGE";
export type BulletinCategory =
  | "MACRO"
  | "FED"
  | "RESULTATS"
  | "GEO"
  | "TECH"
  | "CREDIT"
  | "MARCHE";

export type BulletinEvent =
  | { type: "headline"; text: string; bias: BulletinBias | null }
  | {
      type: "bullet";
      index: number;
      text: string;
      category: BulletinCategory | null;
    }
  | { type: "source"; url: string; title: string }
  | { type: "done" };

export interface BulletinHeadline {
  text: string;
  bias: BulletinBias | null;
}

export interface BulletinBullet {
  text: string;
  category: BulletinCategory | null;
}

export interface BulletinPayload {
  headline: BulletinHeadline;
  bullets: BulletinBullet[];
  sources: BulletinSource[];
}

// Anchored: TITRE starts the line (brackets or bare word for bias)
const HEADLINE_PREFIX = /^(?:TITRE|TITLE|HEADLINE)\s*(?:\[([^\]]+)\]|([A-Za-z]+))?\s*:\s*/i;
// Non-anchored: TITRE may appear after preamble text on the same line
const HEADLINE_SEARCH = /(?:TITRE|TITLE|HEADLINE)\s*(?:\[([^\]]+)\]|([A-Za-z]+))?\s*:\s*/i;
const BULLET_PREFIX = /^[-*•]\s+/;
const BULLET_TAG = /^\[([^\]]+)\]\s*/;

const BIAS_MAP: Record<string, BulletinBias> = {
  HAUSSIER: "HAUSSIER",
  HAUSSIERE: "HAUSSIER",
  BULLISH: "HAUSSIER",
  POSITIF: "HAUSSIER",
  BAISSIER: "BAISSIER",
  BAISSIERE: "BAISSIER",
  BEARISH: "BAISSIER",
  NEGATIF: "BAISSIER",
  MITIGE: "MITIGE",
  MITIGEE: "MITIGE",
  MIXED: "MITIGE",
  NEUTRE: "MITIGE",
};

const CATEGORY_MAP: Record<string, BulletinCategory> = {
  MACRO: "MACRO",
  INFLATION: "MACRO",
  EMPLOI: "MACRO",
  FED: "FED",
  TAUX: "FED",
  BCE: "FED",
  RESULTATS: "RESULTATS",
  EARNINGS: "RESULTATS",
  GEO: "GEO",
  GEOPOLITIQUE: "GEO",
  POLITIQUE: "GEO",
  TECH: "TECH",
  IA: "TECH",
  CREDIT: "CREDIT",
  OBLIGATIONS: "CREDIT",
  MARCHE: "MARCHE",
  MARCHES: "MARCHE",
  FLUX: "MARCHE",
};

function normalizeToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function resolveBias(token: string | undefined | null): BulletinBias | null {
  if (!token) return null;
  return BIAS_MAP[normalizeToken(token)] ?? null;
}

function resolveCategory(
  token: string | undefined | null,
): BulletinCategory | null {
  if (!token) return null;
  return CATEGORY_MAP[normalizeToken(token)] ?? null;
}

interface ParsedBullet {
  text: string;
  category: BulletinCategory | null;
}

interface ParsedBulletin {
  headline: string;
  bias: BulletinBias | null;
  bullets: ParsedBullet[];
}

function parseBulletin(raw: string): ParsedBulletin {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let headline = "";
  let bias: BulletinBias | null = null;
  const bullets: ParsedBullet[] = [];
  let headlineLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const anchored = line.match(HEADLINE_PREFIX);
    if (anchored) {
      bias = resolveBias(anchored[1] ?? anchored[2]);
      headline = line.slice(anchored[0].length).trim();
      headlineLineIndex = i;
      break;
    }
    const mid = line.match(HEADLINE_SEARCH);
    if (mid && mid.index !== undefined) {
      bias = resolveBias(mid[1] ?? mid[2]);
      headline = line.slice(mid.index + mid[0].length).trim();
      headlineLineIndex = i;
      break;
    }
  }

  if (headlineLineIndex === -1 && lines.length > 0) {
    headline = lines[0];
    headlineLineIndex = 0;
  }

  if (!bias && headline) {
    const inlineBias = headline.match(/^\[([^\]]+)\]\s*/);
    if (inlineBias) {
      const candidate = resolveBias(inlineBias[1]);
      if (candidate) {
        bias = candidate;
        headline = headline.slice(inlineBias[0].length).trim();
      }
    }
  }

  for (let i = headlineLineIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(BULLET_PREFIX);
    if (!m) continue;
    let text = lines[i].slice(m[0].length).trim();
    let category: BulletinCategory | null = null;
    const tagMatch = text.match(BULLET_TAG);
    if (tagMatch) {
      const candidate = resolveCategory(tagMatch[1]);
      if (candidate) {
        category = candidate;
        text = text.slice(tagMatch[0].length).trim();
      }
    }
    bullets.push({ text, category });
  }
  return { headline, bias, bullets: bullets.slice(0, 5) };
}

function writeEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: BulletinEvent,
) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
}

export function streamBulletin({
  system,
  user,
  maxTokens = 768,
  apiKey,
  model = DEFAULT_MODEL,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  apiKey?: string;
  model?: string;
}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const key = await resolveKey(apiKey);
        const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: maxTokens,
            stream: true,
          }),
        });

        if (!res.ok) await throwOnBadStatus(res);
        if (!res.body) throw new Error("Réponse sans corps.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const text = parseSseLine(line);
              if (text) fullText += text;
            }
          }
        }
        const tail = decoder.decode();
        if (tail) {
          for (const line of tail.split("\n")) {
            const text = parseSseLine(line);
            if (text) fullText += text;
          }
        }

        const { headline, bias, bullets } = parseBulletin(fullText);
        if (headline)
          writeEvent(controller, { type: "headline", text: headline, bias });
        bullets.forEach((b, index) =>
          writeEvent(controller, {
            type: "bullet",
            index,
            text: b.text,
            category: b.category,
          }),
        );
        writeEvent(controller, { type: "done" });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export async function generateBulletin({
  system,
  user,
  maxTokens = 1400,
  apiKey,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  apiKey?: string;
  model?: string;
}): Promise<BulletinPayload> {
  const research = await researchWithSonarPro({ user, apiKey });
  const data = await createChatCompletion({
    system,
    user: buildStructuringPrompt(user, research),
    maxTokens,
    apiKey,
    model: STRUCTURING_MODEL,
  });

  const fullText = data.choices?.[0]?.message?.content ?? "";
  const { headline, bias, bullets } = parseBulletin(fullText);
  return {
    headline: { text: headline, bias },
    bullets: bullets.map((b) => ({ text: b.text, category: b.category })),
    sources: research.sources,
  };
}
