import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

const encoder = new TextEncoder();

export function streamText({
  system,
  user,
  maxTokens = 1024,
  apiKey,
  tools,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  apiKey?: string;
  tools?: Anthropic.Messages.MessageCreateParams["tools"];
}): ReadableStream<Uint8Array> {
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    ...(tools ? { tools } : {}),
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.controller.abort();
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

const HEADLINE_PREFIX = /^(?:TITRE|TITLE|HEADLINE)\s*(?:\[([^\]]+)\])?\s*:\s*/i;
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
  for (const line of lines) {
    if (!headline) {
      const headlineMatch = line.match(HEADLINE_PREFIX);
      if (headlineMatch) {
        bias = resolveBias(headlineMatch[1]);
        headline = line.slice(headlineMatch[0].length).trim();
      } else {
        headline = line.trim();
      }
      // Some models put the bias inline at the start of the headline body too.
      if (!bias) {
        const inlineBias = headline.match(/^\[([^\]]+)\]\s*/);
        if (inlineBias) {
          const candidate = resolveBias(inlineBias[1]);
          if (candidate) {
            bias = candidate;
            headline = headline.slice(inlineBias[0].length).trim();
          }
        }
      }
      continue;
    }
    const m = line.match(BULLET_PREFIX);
    if (!m) continue;
    let text = line.slice(m[0].length).trim();
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
  return { headline, bias, bullets: bullets.slice(0, 3) };
}

export function streamBulletin({
  system,
  user,
  maxTokens = 768,
  apiKey,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  apiKey?: string;
}): ReadableStream<Uint8Array> {
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 2,
      },
    ],
  });

  const writeEvent = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: BulletinEvent,
  ) => {
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let fullText = "";
        const sources: BulletinSource[] = [];
        const seen = new Set<string>();
        const addSource = (url: unknown, title: unknown) => {
          if (typeof url !== "string" || !url || seen.has(url)) return;
          seen.add(url);
          sources.push({
            url,
            title: typeof title === "string" && title ? title : url,
          });
        };

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = event.content_block as { type?: string; content?: unknown };
            if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
              for (const r of block.content as Array<{
                type?: string;
                url?: unknown;
                title?: unknown;
              }>) {
                if (r.type === "web_search_result") addSource(r.url, r.title);
              }
            }
          } else if (event.type === "content_block_delta") {
            const delta = event.delta as { type?: string; text?: unknown; citation?: unknown };
            if (delta.type === "text_delta" && typeof delta.text === "string") {
              fullText += delta.text;
            } else if (delta.type === "citations_delta" && delta.citation) {
              const c = delta.citation as { url?: unknown; title?: unknown };
              addSource(c.url, c.title);
            }
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
        sources.slice(0, 5).forEach((s) =>
          writeEvent(controller, { type: "source", url: s.url, title: s.title }),
        );
        writeEvent(controller, { type: "done" });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });
}
