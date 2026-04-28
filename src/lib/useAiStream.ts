"use client";

import { useEffect, useState } from "react";

interface AiStreamState {
  text: string;
  loading: boolean;
  error: string | null;
}

export function useAiStream<TBody>(
  url: string,
  body: TBody | null,
): AiStreamState {
  // JSON.stringify is stable for the simple bodies we pass in (no functions,
  // no cyclic refs); it lets us key the effect on value rather than identity.
  const key = body == null ? null : JSON.stringify(body);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // React-recommended pattern for resetting state when an input changes:
  // do it in render, not in an effect. https://react.dev/reference/react/useState
  if (key !== lastKey) {
    setLastKey(key);
    setText("");
    setError(null);
    setLoading(key != null);
  }

  useEffect(() => {
    if (key == null) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) message = j.error;
          } catch {
            /* corps non JSON */
          }
          throw new Error(message);
        }

        if (!res.body) throw new Error("Réponse sans corps.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            setText((prev) => prev + decoder.decode(value, { stream: true }));
          }
        }
        const tail = decoder.decode();
        if (tail) setText((prev) => prev + tail);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [url, key]);

  return { text, loading, error };
}
