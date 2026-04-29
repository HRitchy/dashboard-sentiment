"use client";

import { useEffect, useRef, useState } from "react";

interface AiStreamState {
  text: string;
  loading: boolean;
  error: string | null;
}

interface AiStreamOptions {
  apiKey?: string | null;
  // When set, the streamed response is persisted in localStorage and reused
  // for the rest of the calendar day. Body changes during the day do NOT
  // trigger a refetch — this keeps token consumption to one call per day.
  dailyCacheKey?: string | null;
}

interface CachedEntry {
  date: string;
  text: string;
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readCache(key: string): CachedEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedEntry>;
    if (
      parsed &&
      typeof parsed.date === "string" &&
      typeof parsed.text === "string"
    ) {
      return { date: parsed.date, text: parsed.text };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useAiStream<TBody>(
  url: string,
  body: TBody | null,
  options: AiStreamOptions = {},
): AiStreamState {
  const { apiKey, dailyCacheKey } = options;

  // JSON.stringify is stable for the simple bodies we pass in (no functions,
  // no cyclic refs); it lets us key the effect on value rather than identity.
  const bodyKey = body == null ? null : JSON.stringify(body);
  const trimmedKey = apiKey?.trim() || null;

  // In daily-cache mode the React key is fixed per cache key so body changes
  // (e.g. user clicking « Actualiser ») never reschedule the effect.
  // Without daily caching we keep the legacy behaviour: each body change
  // restarts the stream.
  const reactKey =
    bodyKey == null
      ? null
      : dailyCacheKey
        ? `daily:${dailyCacheKey}`
        : `${trimmedKey ?? ""}::${bodyKey}`;

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReactKey, setLastReactKey] = useState<string | null>(null);

  const cacheValidRef = useRef(false);
  const bodyRef = useRef<string | null>(null);
  const apiKeyRef = useRef<string | null>(null);
  bodyRef.current = bodyKey;
  apiKeyRef.current = trimmedKey;

  // React-recommended pattern for resetting state when an input changes:
  // do it in render, not in an effect. https://react.dev/reference/react/useState
  if (reactKey !== lastReactKey) {
    setLastReactKey(reactKey);
    cacheValidRef.current = false;

    let hydrated: string | null = null;
    if (dailyCacheKey && reactKey != null && typeof window !== "undefined") {
      const cached = readCache(dailyCacheKey);
      if (cached && cached.date === todayStamp()) {
        hydrated = cached.text;
        cacheValidRef.current = true;
      }
    }

    if (hydrated != null) {
      setText(hydrated);
      setLoading(false);
      setError(null);
    } else {
      setText("");
      setError(null);
      setLoading(reactKey != null);
    }
  }

  useEffect(() => {
    if (reactKey == null) return;
    if (cacheValidRef.current) return;
    const sendBody = bodyRef.current;
    if (sendBody == null) return;

    const controller = new AbortController();
    let accumulated = "";

    (async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const sendKey = apiKeyRef.current;
        if (sendKey) headers["x-anthropic-api-key"] = sendKey;

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: sendBody,
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
            const chunk = decoder.decode(value, { stream: true });
            accumulated += chunk;
            setText((prev) => prev + chunk);
          }
        }
        const tail = decoder.decode();
        if (tail) {
          accumulated += tail;
          setText((prev) => prev + tail);
        }

        if (dailyCacheKey && accumulated) {
          try {
            const entry: CachedEntry = {
              date: todayStamp(),
              text: accumulated,
            };
            localStorage.setItem(dailyCacheKey, JSON.stringify(entry));
            cacheValidRef.current = true;
          } catch {
            /* ignore quota errors */
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reactKey, url, dailyCacheKey]);

  return { text, loading, error };
}
