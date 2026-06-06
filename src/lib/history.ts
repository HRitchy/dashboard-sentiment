// Historique local des lectures d'indicateurs.
//
// On conserve une valeur par jour calendaire et par indicateur (la dernière
// observée dans la journée). Cela suffit pour tracer une tendance « depuis la
// veille » et une mini-sparkline, tout en gardant le stockage borné.

export type IndicatorKey = "vix" | "oas" | "fg" | "nfci";

export interface DayPoint {
  d: string; // clé jour locale "YYYY-MM-DD"
  v: number;
}

export type History = Record<IndicatorKey, DayPoint[]>;

export interface Trend {
  dir: "up" | "down" | "flat";
  delta: number;
}

const STORAGE_KEY = "dashboard-history-v1";
const MAX_DAYS = 60;
const KEYS: IndicatorKey[] = ["vix", "oas", "fg", "nfci"];

function emptyHistory(): History {
  return { vix: [], oas: [], fg: [], nfci: [] };
}

function dayKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function loadHistory(): History {
  if (typeof window === "undefined") return emptyHistory();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyHistory();
    const parsed = JSON.parse(raw) as Partial<History>;
    const base = emptyHistory();
    for (const k of KEYS) {
      const arr = parsed[k];
      if (Array.isArray(arr)) {
        base[k] = arr.filter(
          (p): p is DayPoint =>
            !!p &&
            typeof p.d === "string" &&
            typeof p.v === "number" &&
            !isNaN(p.v),
        );
      }
    }
    return base;
  } catch {
    return emptyHistory();
  }
}

function save(history: History): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* ignore (quota, mode privé, …) */
  }
}

// Insère/écrase la valeur du jour pour chaque indicateur fourni, élague à
// MAX_DAYS, persiste et renvoie l'historique mis à jour.
export function recordReadings(
  history: History,
  readings: Partial<Record<IndicatorKey, number | null>>,
  now: Date = new Date(),
): History {
  const today = dayKey(now);
  const next: History = emptyHistory();

  for (const k of KEYS) {
    const points = history[k].slice();
    const v = readings[k];
    if (typeof v === "number" && !isNaN(v)) {
      const lastIdx = points.length - 1;
      if (lastIdx >= 0 && points[lastIdx].d === today) {
        points[lastIdx] = { d: today, v };
      } else {
        points.push({ d: today, v });
      }
    }
    next[k] = points.slice(-MAX_DAYS);
  }

  save(next);
  return next;
}

// Valeurs chronologiques, pour la sparkline.
export function valuesOf(points: DayPoint[]): number[] {
  return points.map((p) => p.v);
}

// Tendance vs. dernier relevé précédent (la veille dans le cas usuel).
export function trendOf(points: DayPoint[]): Trend | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].v;
  const prev = points[points.length - 2].v;
  const delta = last - prev;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { dir, delta };
}
