// Petit cache mémoire process-wide pour les routes d'indicateurs.
// Les erreurs ne sont pas mises en cache : un retry suivant un échec retentera
// immédiatement le loader.

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

// Fetch avec timeout + petites relances pour absorber les timeouts/coupures
// réseau transitoires (FRED et Yahoo répondent parfois lentement).
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000,
  retries = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        // Backoff court avant la prochaine tentative.
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  if (lastErr instanceof DOMException && lastErr.name === "TimeoutError") {
    throw new Error(`Délai dépassé (${timeoutMs} ms)`);
  }
  throw lastErr;
}
