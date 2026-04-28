import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();
export const MODEL = "claude-sonnet-4-6";

const encoder = new TextEncoder();

export function streamText({
  system,
  user,
  maxTokens = 1024,
}: {
  system: string;
  user: string;
  maxTokens?: number;
}): ReadableStream<Uint8Array> {
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
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
