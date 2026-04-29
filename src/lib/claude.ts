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
