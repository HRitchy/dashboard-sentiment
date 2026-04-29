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

export type BulletinEvent =
  | { type: "headline"; text: string }
  | { type: "bullet"; index: number; text: string }
  | { type: "source"; url: string; title: string }
  | { type: "done" };

const HEADLINE_PREFIX = /^(?:TITRE|TITLE|HEADLINE)\s*:\s*/i;
const BULLET_PREFIX = /^[-*•]\s+/;

function parseBulletin(raw: string): { headline: string; bullets: string[] } {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let headline = "";
  const bullets: string[] = [];
  for (const line of lines) {
    if (!headline) {
      headline = line.replace(HEADLINE_PREFIX, "").trim();
      continue;
    }
    const m = line.match(BULLET_PREFIX);
    if (m) bullets.push(line.slice(m[0].length).trim());
  }
  return { headline, bullets: bullets.slice(0, 3) };
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

        const { headline, bullets } = parseBulletin(fullText);
        if (headline) writeEvent(controller, { type: "headline", text: headline });
        bullets.forEach((text, index) =>
          writeEvent(controller, { type: "bullet", index, text }),
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
