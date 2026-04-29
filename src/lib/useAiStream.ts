"use client";

import { useEffect, useState } from "react";

interface AiStreamState {
  text: string;
  loading: boolean;
  error: string | null;
}

interface AiStreamOptions {
  apiKey?: string | null;
}

export function useAiStream<TBody>(
  url: string,
  body: TBody | null,
  options: AiStreamOptions = {},
): AiStreamState {
  const { apiKey } = options;

  // JSON.stringify is stable for the simple bodies we pass in (no functions,
  // no cyclic refs); it lets us key the effect on value rather than identity.
  const bodyKey = body == null ? null : JSON.stringify(body);
  const trimmedKey = apiKey?.trim() || null;
  const cacheKey =
    bodyKey == null ? null : `${trimmedKey ?? ""}::${bodyKey}`;

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);


  // React-recommended pattern for resetting state when an input changes:
  // do it in render, not in an effect. https://react.dev/reference/react/useState
  if (cacheKey !== lastKey) {
    setLastKey(cacheKey);
    setError(null);

    let cachedText = "";
    if (cacheKey != null && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(`ai-daily-cache::${url}::${cacheKey}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { date?: string; text?: string };
          const today = new Date().toISOString().slice(0, 10);
          if (parsed?.date === today && typeof parsed.text === "string") {
            cachedText = parsed.text;
          }
        }
      } catch {
        /* ignore localStorage issues */
      }
    }

    setText(cachedText);
    setLoading(cacheKey != null && !cachedText);
  }

  useEffect(() => {
    if (bodyKey == null) return;
    const controller = new AbortController();
    const key = `ai-daily-cache::${url}::${cacheKey ?? bodyKey}`;

    if (text) return;

    (async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (trimmedKey) headers["x-anthropic-api-key"] = trimmedKey;

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: bodyKey,
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
        let finalText = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            finalText += chunk;
            setText((prev) => prev + chunk);
          }
        }
        const tail = decoder.decode();
        if (tail) {
          finalText += tail;
          setText((prev) => prev + tail);
        }
        try {
          localStorage.setItem(
            key,
            JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              text: finalText,
            }),
          );
        } catch {
          /* ignore localStorage issues */
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [url, bodyKey, trimmedKey, cacheKey, text]);

  return { text, loading, error };
}
