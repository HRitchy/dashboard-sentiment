"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BulletinSource {
  url: string;
  title: string;
}

export interface BulletinPayload {
  headline: string;
  bullets: string[];
  sources: BulletinSource[];
}

export interface BulletinState extends BulletinPayload {
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface CachedEntry {
  date: string;
  payload: BulletinPayload;
}

interface UseAiBulletinOptions {
  apiKey?: string | null;
  dailyCacheKey?: string | null;
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
    const parsed = JSON.parse(raw) as Partial<CachedEntry> & {
      payload?: Partial<BulletinPayload>;
    };
    const p = parsed?.payload;
    if (
      parsed &&
      typeof parsed.date === "string" &&
      p &&
      typeof p.headline === "string" &&
      Array.isArray(p.bullets) &&
      Array.isArray(p.sources)
    ) {
      return {
        date: parsed.date,
        payload: {
          headline: p.headline,
          bullets: p.bullets.filter((b): b is string => typeof b === "string"),
          sources: p.sources.filter(
            (s): s is BulletinSource =>
              !!s &&
              typeof (s as BulletinSource).url === "string" &&
              typeof (s as BulletinSource).title === "string",
          ),
        },
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

interface BulletinEvent {
  type?: string;
  text?: unknown;
  url?: unknown;
  title?: unknown;
}

export function useAiBulletin<TBody>(
  url: string,
  body: TBody | null,
  options: UseAiBulletinOptions = {},
): BulletinState {
  const { apiKey, dailyCacheKey } = options;

  const bodyKey = body == null ? null : JSON.stringify(body);
  const trimmedKey = apiKey?.trim() || null;

  const [refreshNonce, setRefreshNonce] = useState(0);

  const reactKey =
    bodyKey == null
      ? null
      : dailyCacheKey
        ? `daily:${dailyCacheKey}:${refreshNonce}`
        : `${trimmedKey ?? ""}::${bodyKey}:${refreshNonce}`;

  const [headline, setHeadline] = useState("");
  const [bullets, setBullets] = useState<string[]>([]);
  const [sources, setSources] = useState<BulletinSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReactKey, setLastReactKey] = useState<string | null>(null);

  const cacheValidRef = useRef(false);
  const bodyRef = useRef<string | null>(null);
  const apiKeyRef = useRef<string | null>(null);
  bodyRef.current = bodyKey;
  apiKeyRef.current = trimmedKey;

  if (reactKey !== lastReactKey) {
    setLastReactKey(reactKey);
    cacheValidRef.current = false;

    let hydrated: CachedEntry | null = null;
    if (dailyCacheKey && reactKey != null && typeof window !== "undefined") {
      const cached = readCache(dailyCacheKey);
      if (cached && cached.date === todayStamp()) {
        hydrated = cached;
        cacheValidRef.current = true;
      }
    }

    if (hydrated) {
      setHeadline(hydrated.payload.headline);
      setBullets(hydrated.payload.bullets);
      setSources(hydrated.payload.sources);
      setLoading(false);
      setError(null);
    } else {
      setHeadline("");
      setBullets([]);
      setSources([]);
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

    const acc: BulletinPayload = {
      headline: "",
      bullets: [],
      sources: [],
    };

    const handleEvent = (evt: BulletinEvent) => {
      if (evt.type === "headline" && typeof evt.text === "string") {
        acc.headline = evt.text;
        setHeadline(evt.text);
      } else if (evt.type === "bullet" && typeof evt.text === "string") {
        acc.bullets = [...acc.bullets, evt.text];
        setBullets(acc.bullets);
      } else if (evt.type === "source" && typeof evt.url === "string") {
        const title = typeof evt.title === "string" && evt.title ? evt.title : evt.url;
        acc.sources = [...acc.sources, { url: evt.url, title }];
        setSources(acc.sources);
      }
    };

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
        let buffer = "";

        const flushLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            handleEvent(JSON.parse(trimmed) as BulletinEvent);
          } catch {
            /* ligne invalide, on ignore */
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf("\n")) >= 0) {
              flushLine(buffer.slice(0, idx));
              buffer = buffer.slice(idx + 1);
            }
          }
        }
        const tail = decoder.decode();
        if (tail) buffer += tail;
        if (buffer) flushLine(buffer);

        if (dailyCacheKey && acc.headline) {
          try {
            const entry: CachedEntry = {
              date: todayStamp(),
              payload: acc,
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

  const refresh = useCallback(() => {
    if (dailyCacheKey && typeof window !== "undefined") {
      try {
        localStorage.removeItem(dailyCacheKey);
      } catch {
        /* ignore */
      }
    }
    setRefreshNonce((n) => n + 1);
  }, [dailyCacheKey]);

  return { headline, bullets, sources, loading, error, refresh };
}
