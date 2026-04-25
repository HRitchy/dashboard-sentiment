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

export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
