"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BulletinBias, BulletinCategory } from "./claude";

export interface BulletinSource {
  url: string;
  title: string;
}

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

export interface BulletinState extends BulletinPayload {
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  refresh: () => void;
}

interface CachedEntry {
  date: string;
  updatedAt: number;
  payload: BulletinPayload;
}

interface UseAiBulletinOptions {
  apiKey?: string | null;
  dailyCacheKey?: string | null;
}

const EMPTY_HEADLINE: BulletinHeadline = { text: "", bias: null };

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
      payload?: Partial<BulletinPayload> & {
        headline?: unknown;
        bullets?: unknown;
        sources?: unknown;
      };
    };
    const p = parsed?.payload;
    if (!parsed || typeof parsed.date !== "string" || !p) return null;

    let headline: BulletinHeadline | null = null;
    if (typeof p.headline === "string") {
      headline = { text: p.headline, bias: null };
    } else if (
      p.headline &&
      typeof (p.headline as BulletinHeadline).text === "string"
    ) {
      const h = p.headline as BulletinHeadline;
      headline = { text: h.text, bias: h.bias ?? null };
    }
    if (!headline) return null;

    if (!Array.isArray(p.bullets) || !Array.isArray(p.sources)) return null;

    const bullets: BulletinBullet[] = (p.bullets as unknown[])
      .map((b): BulletinBullet | null => {
        if (typeof b === "string") return { text: b, category: null };
        if (b && typeof (b as BulletinBullet).text === "string") {
          const bb = b as BulletinBullet;
          return { text: bb.text, category: bb.category ?? null };
        }
        return null;
      })
      .filter((b): b is BulletinBullet => b != null);

    const sources: BulletinSource[] = (p.sources as unknown[]).filter(
      (s): s is BulletinSource =>
        !!s &&
        typeof (s as BulletinSource).url === "string" &&
        typeof (s as BulletinSource).title === "string",
    );

    const updatedAt =
      typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.parse(parsed.date);

    return {
      date: parsed.date,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      payload: { headline, bullets, sources },
    };
  } catch {
    return null;
  }
}

interface BulletinEvent {
  type?: string;
  text?: unknown;
  url?: unknown;
  title?: unknown;
  bias?: unknown;
  category?: unknown;
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

  const [headline, setHeadline] = useState<BulletinHeadline>(EMPTY_HEADLINE);
  const [bullets, setBullets] = useState<BulletinBullet[]>([]);
  const [sources, setSources] = useState<BulletinSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
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
      setLastUpdatedAt(hydrated.updatedAt);
      setLoading(false);
      setError(null);
    } else {
      setHeadline(EMPTY_HEADLINE);
      setBullets([]);
      setSources([]);
      setLastUpdatedAt(null);
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
      headline: { text: "", bias: null },
      bullets: [],
      sources: [],
    };

    const handleEvent = (evt: BulletinEvent) => {
      if (evt.type === "headline" && typeof evt.text === "string") {
        const bias =
          evt.bias === "HAUSSIER" || evt.bias === "BAISSIER" || evt.bias === "MITIGE"
            ? evt.bias
            : null;
        acc.headline = { text: evt.text, bias };
        setHeadline(acc.headline);
      } else if (evt.type === "bullet" && typeof evt.text === "string") {
        const category =
          typeof evt.category === "string" &&
          ["MACRO", "FED", "RESULTATS", "GEO", "TECH", "CREDIT", "MARCHE"].includes(
            evt.category,
          )
            ? (evt.category as BulletinCategory)
            : null;
        acc.bullets = [...acc.bullets, { text: evt.text, category }];
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

        if (dailyCacheKey && acc.headline.text) {
          const updatedAt = Date.now();
          try {
            const entry: CachedEntry = {
              date: todayStamp(),
              updatedAt,
              payload: acc,
            };
            localStorage.setItem(dailyCacheKey, JSON.stringify(entry));
            cacheValidRef.current = true;
          } catch {
            /* ignore quota errors */
          }
          setLastUpdatedAt(updatedAt);
        } else if (acc.headline.text) {
          setLastUpdatedAt(Date.now());
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

  return { headline, bullets, sources, loading, error, lastUpdatedAt, refresh };
}
