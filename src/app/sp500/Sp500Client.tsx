"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./page.module.css";

const SYMBOL = "^GSPC";
const THEME_KEY = "dashboard-theme";

type Theme = "light" | "dark";
type RangeKey = "6m" | "ytd" | "1y" | "5y" | "10y" | "max";

type Point = { t: number; c: number };

type FetchResult = {
  points: Point[];
  meta: { currency?: string; symbol?: string };
  source: string;
};

type FetchError = Error & { attempts?: string[] };

const RANGES: { k: RangeKey; l: string }[] = [
  { k: "6m", l: "6M" },
  { k: "ytd", l: "YTD" },
  { k: "1y", l: "1A" },
  { k: "5y", l: "5A" },
  { k: "10y", l: "10A" },
  { k: "max", l: "MAX" },
];

function fmtPrice(v: number | null | undefined, dec = 2): string {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}
function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtMonthYear(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
}
function fmtYear(ts: number): string {
  return new Date(ts * 1000).getFullYear().toString();
}

function sma(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v != null && !isNaN(v)) {
        s += v;
        c++;
      }
    }
    out[i] = c === period ? s / period : null;
  }
  return out;
}

async function fetchData(): Promise<FetchResult> {
  const period2 = Math.floor(Date.now() / 1000);
  const direct = `https://query2.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&period1=0&period2=${period2}`;
  const directQ1 = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&period1=0&period2=${period2}`;
  const stooqUrl = "https://stooq.com/q/d/l/?s=^spx&i=d";
  const stooqProxied = "https://r.jina.ai/" + stooqUrl;

  type Candidate = {
    url: string;
    parser: "json" | "json-or-text" | "allorigins-wrapped" | "stooq-csv";
  };
  const candidates: Candidate[] = [
    { url: "https://r.jina.ai/" + direct, parser: "json-or-text" },
    { url: "https://r.jina.ai/" + directQ1, parser: "json-or-text" },
    { url: direct, parser: "json" },
    { url: directQ1, parser: "json" },
    {
      url: "https://corsproxy.io/?url=" + encodeURIComponent(direct),
      parser: "json",
    },
    {
      url: "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(direct),
      parser: "json",
    },
    {
      url: "https://api.allorigins.win/raw?url=" + encodeURIComponent(direct),
      parser: "json",
    },
    {
      url: "https://api.allorigins.win/get?url=" + encodeURIComponent(direct),
      parser: "allorigins-wrapped",
    },
    { url: stooqProxied, parser: "stooq-csv" },
  ];

  const errors: string[] = [];
  for (const c of candidates) {
    const label = c.url.replace(/^https?:\/\//, "").split("/")[0];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(c.url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        errors.push(`${label} HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();

      if (c.parser === "stooq-csv") {
        const lines = text.trim().split("\n");
        if (lines.length < 2) {
          errors.push(`${label} CSV vide`);
          continue;
        }
        const points: Point[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          const d = cols[0];
          const close = cols[4];
          const t = Math.floor(new Date(d + "T00:00:00Z").getTime() / 1000);
          const c2 = parseFloat(close);
          if (!isNaN(t) && !isNaN(c2)) points.push({ t, c: c2 });
        }
        if (points.length === 0) {
          errors.push(`${label} CSV illisible`);
          continue;
        }
        return {
          points,
          meta: { currency: "USD", symbol: "^GSPC" },
          source: "Stooq via " + label,
        };
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            json = JSON.parse(m[0]);
          } catch {
            errors.push(`${label} JSON invalide`);
            continue;
          }
        } else {
          errors.push(`${label} réponse non-JSON`);
          continue;
        }
      }

      if (
        c.parser === "allorigins-wrapped" &&
        json &&
        typeof json === "object" &&
        "contents" in json
      ) {
        const wrapped = json as { contents: string };
        json = JSON.parse(wrapped.contents);
      }

      const j = json as {
        chart?: {
          error?: { description?: string };
          result?: Array<{
            timestamp: number[];
            indicators: { quote: Array<{ close: (number | null)[] }> };
            meta: { currency?: string; symbol?: string };
          }>;
        };
      };
      if (j.chart?.error) {
        errors.push(`${label} ${j.chart.error.description || "Yahoo error"}`);
        continue;
      }
      if (!j.chart?.result?.[0]) {
        errors.push(`${label} format inattendu`);
        continue;
      }
      const r = j.chart.result[0];
      const ts = r.timestamp;
      const closes = r.indicators.quote[0].close;
      const meta = r.meta;
      const points: Point[] = ts
        .map((t, i) => ({ t, c: closes[i] as number }))
        .filter((p) => p.c != null && !isNaN(p.c));
      if (points.length === 0) {
        errors.push(`${label} 0 points`);
        continue;
      }
      return { points, meta, source: label };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message || e.name : String(e);
      errors.push(`${label} ${msg || "erreur"}`);
    }
  }
  const err = new Error("Toutes les sources ont échoué") as FetchError;
  err.attempts = errors;
  throw err;
}

function rangeSlice(points: Point[], key: RangeKey): Point[] {
  if (points.length === 0) return points;
  const last = points[points.length - 1];
  const lastT = last.t;
  let cutoff: number;
  switch (key) {
    case "6m":
      cutoff = lastT - 180 * 86400;
      break;
    case "ytd": {
      const d = new Date(lastT * 1000);
      cutoff = Math.floor(new Date(d.getFullYear(), 0, 1).getTime() / 1000);
      break;
    }
    case "1y":
      cutoff = lastT - 365 * 86400;
      break;
    case "5y":
      cutoff = lastT - 5 * 365 * 86400;
      break;
    case "10y":
      cutoff = lastT - 10 * 365 * 86400;
      break;
    case "max":
    default:
      return points;
  }
  return points.filter((p) => p.t >= cutoff);
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

type ChartProps = {
  points: Point[];
  mm50: (number | null)[];
  mm200: (number | null)[];
};

function Chart({ points, mm50, mm200 }: ChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 1200, h: 480 });
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setDim({ w: rect.width || 1200, h: rect.height || 480 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const W = dim.w;
    const H = dim.h;
    const PAD_L = 56;
    const PAD_R = 16;
    const PAD_T = 16;
    const PAD_B = 28;
    const cw = W - PAD_L - PAD_R;
    const ch = H - PAD_T - PAD_B;

    const allY: number[] = [];
    points.forEach((p) => allY.push(p.c));
    mm50.forEach((v) => v != null && allY.push(v));
    mm200.forEach((v) => v != null && allY.push(v));
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const padY = (maxY - minY) * 0.08 || 1;
    const y0 = minY - padY;
    const y1 = maxY + padY;

    const x = (i: number) =>
      PAD_L + (i / Math.max(1, points.length - 1)) * cw;
    const y = (v: number) => PAD_T + (1 - (v - y0) / (y1 - y0)) * ch;

    function pathFor(values: (number | null)[]): string {
      let d = "";
      let open = false;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v == null || isNaN(v)) {
          open = false;
          continue;
        }
        d += (open ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
        open = true;
      }
      return d.trim();
    }

    const pricePath = pathFor(points.map((p) => p.c));
    const mm50Path = pathFor(mm50);
    const mm200Path = pathFor(mm200);
    const areaPath = pricePath
      ? `${pricePath} L${x(points.length - 1).toFixed(1)} ${(PAD_T + ch).toFixed(1)} L${x(0).toFixed(1)} ${(PAD_T + ch).toFixed(1)} Z`
      : "";

    const yTicks = 5;
    const ticks = [];
    for (let i = 0; i <= yTicks; i++) {
      const v = y0 + (i / yTicks) * (y1 - y0);
      ticks.push({ v, y: y(v) });
    }

    const xTickN = Math.min(6, points.length);
    const xTicks: { i: number; t: number }[] = [];
    for (let i = 0; i < xTickN; i++) {
      const idx = Math.round((i / Math.max(1, xTickN - 1)) * (points.length - 1));
      xTicks.push({ i: idx, t: points[idx].t });
    }

    const spanYears =
      points.length > 1
        ? (points[points.length - 1].t - points[0].t) / (365.25 * 86400)
        : 0;
    const xFmt = spanYears > 6 ? fmtYear : fmtMonthYear;

    return {
      W,
      H,
      PAD_L,
      PAD_R,
      PAD_T,
      PAD_B,
      cw,
      ch,
      x,
      y,
      pricePath,
      mm50Path,
      mm200Path,
      areaPath,
      ticks,
      xTicks,
      xFmt,
    };
  }, [dim, points, mm50, mm200]);

  const onMove = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap || points.length === 0) return;
    const rect = wrap.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * layout.W;
    const ratio = (px - layout.PAD_L) / layout.cw;
    const idx = Math.max(
      0,
      Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))
    );
    setHover(idx);
  };

  const hoverPoint = hover != null ? points[hover] : null;
  const hoverMm50 = hover != null ? mm50[hover] : null;
  const hoverMm200 = hover != null ? mm200[hover] : null;
  const hoverX = hover != null ? layout.x(hover) : 0;
  const hoverYPrice = hoverPoint ? layout.y(hoverPoint.c) : 0;

  let tipLeftPct = 0;
  let tipTopPct = 0;
  if (hover != null && hoverPoint) {
    tipLeftPct = (hoverX / layout.W) * 100;
    tipTopPct = (hoverYPrice / layout.H) * 100;
  }

  return (
    <div ref={wrapRef} className={styles.chartSvgWrap}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${layout.W} ${layout.H}`}
        preserveAspectRatio="none"
      >
        <g className={styles.chartGrid}>
          {layout.ticks.map((t, i) => (
            <line
              key={i}
              x1={layout.PAD_L}
              x2={layout.W - layout.PAD_R}
              y1={t.y}
              y2={t.y}
            />
          ))}
        </g>
        <g className={styles.chartAxis}>
          {layout.ticks.map((t, i) => (
            <text
              key={i}
              x={layout.PAD_L - 10}
              y={t.y + 3}
              textAnchor="end"
            >
              {fmtPrice(t.v, 0)}
            </text>
          ))}
        </g>
        <g className={styles.chartAxis}>
          {layout.xTicks.map((t, i) => (
            <text
              key={i}
              x={layout.x(t.i)}
              y={layout.H - 10}
              textAnchor="middle"
            >
              {layout.xFmt(t.t)}
            </text>
          ))}
        </g>
        {layout.areaPath && (
          <path className={styles.priceArea} d={layout.areaPath} />
        )}
        {layout.mm200Path && (
          <path className={styles.mm200Line} d={layout.mm200Path} />
        )}
        {layout.mm50Path && (
          <path className={styles.mm50Line} d={layout.mm50Path} />
        )}
        {layout.pricePath && (
          <path className={styles.priceLine} d={layout.pricePath} />
        )}
        <line
          className={`${styles.crosshairV} ${hover != null ? styles.on : ""}`}
          x1={hoverX}
          x2={hoverX}
          y1={layout.PAD_T}
          y2={layout.PAD_T + layout.ch}
        />
        {hoverPoint && (
          <circle
            className={`${styles.hoverDot} ${styles.on}`}
            cx={hoverX}
            cy={layout.y(hoverPoint.c)}
            r={3.2}
            fill="var(--ink)"
          />
        )}
        {hover != null && hoverMm50 != null && (
          <circle
            className={`${styles.hoverDot} ${styles.on}`}
            cx={hoverX}
            cy={layout.y(hoverMm50)}
            r={3.2}
            fill="var(--c-mm50)"
          />
        )}
        {hover != null && hoverMm200 != null && (
          <circle
            className={`${styles.hoverDot} ${styles.on}`}
            cx={hoverX}
            cy={layout.y(hoverMm200)}
            r={3.2}
            fill="var(--c-mm200)"
          />
        )}
        <rect
          x={layout.PAD_L}
          y={layout.PAD_T}
          width={layout.cw}
          height={layout.ch}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseMove={(e) => onMove(e.clientX)}
          onMouseLeave={() => setHover(null)}
          onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
          onTouchEnd={() => setHover(null)}
        />
      </svg>
      {hoverPoint && (
        <div
          className={`${styles.tooltip} ${styles.on}`}
          style={{ left: `${tipLeftPct}%`, top: `${tipTopPct}%` }}
        >
          <div className={styles.tDate}>{fmtDate(hoverPoint.t)}</div>
          <div className={styles.tRow}>
            <span className={styles.tLab}>
              <span
                className={styles.tSwatch}
                style={{ background: "var(--ink)" }}
              />
              Cours
            </span>
            <span className={styles.tVal}>{fmtPrice(hoverPoint.c)}</span>
          </div>
          <div className={styles.tRow}>
            <span className={styles.tLab}>
              <span
                className={styles.tSwatch}
                style={{ background: "var(--c-mm50)" }}
              />
              MM50
            </span>
            <span className={styles.tVal}>
              {hoverMm50 != null ? fmtPrice(hoverMm50) : "—"}
            </span>
          </div>
          <div className={styles.tRow}>
            <span className={styles.tLab}>
              <span
                className={styles.tSwatch}
                style={{ background: "var(--c-mm200)" }}
              />
              MM200
            </span>
            <span className={styles.tVal}>
              {hoverMm200 != null ? fmtPrice(hoverMm200) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sp500Client() {
  const [theme, setTheme] = useState<Theme>("light");
  const [rangeKey, setRangeKey] = useState<RangeKey>("1y");
  const [data, setData] = useState<{
    points: Point[];
    mm50All: (number | null)[];
    mm200All: (number | null)[];
    meta: { currency?: string; symbol?: string };
    source: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    attempts?: string[];
  } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchData();
      const closes = result.points.map((p) => p.c);
      const mm50All = sma(closes, 50);
      const mm200All = sma(closes, 200);
      setData({
        points: result.points,
        mm50All,
        mm200All,
        meta: result.meta,
        source: result.source,
      });
    } catch (e: unknown) {
      const err = e as FetchError;
      setError({
        message: err.message || String(e),
        attempts: err.attempts,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const slice = useMemo(() => {
    if (!data) return null;
    const s = rangeSlice(data.points, rangeKey);
    if (s.length === 0) return null;
    const startIdx = data.points.indexOf(s[0]);
    return {
      points: s,
      mm50: data.mm50All.slice(startIdx, startIdx + s.length),
      mm200: data.mm200All.slice(startIdx, startIdx + s.length),
    };
  }, [data, rangeKey]);

  const stats = useMemo(() => {
    if (!data || !slice) return null;
    const last = slice.points[slice.points.length - 1];
    const first = slice.points[0];
    const prev = slice.points[slice.points.length - 2] || first;
    const dayDelta = last.c - prev.c;
    const dayDeltaPct = (dayDelta / prev.c) * 100;
    const periodDelta = last.c - first.c;
    const periodDeltaPct = (periodDelta / first.c) * 100;

    const last252 = data.points.slice(Math.max(0, data.points.length - 252));
    const high52 = Math.max(...last252.map((p) => p.c));
    const low52 = Math.min(...last252.map((p) => p.c));

    const lastMM50 = slice.mm50[slice.mm50.length - 1];
    const lastMM200 = slice.mm200[slice.mm200.length - 1];
    const goldenCross =
      lastMM50 != null && lastMM200 != null && lastMM50 > lastMM200;

    return {
      last,
      first,
      dayDelta,
      dayDeltaPct,
      periodDelta,
      periodDeltaPct,
      high52,
      low52,
      lastMM50,
      lastMM200,
      goldenCross,
    };
  }, [data, slice]);

  const currency = data?.meta.currency || "EUR";

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandDot} />
            <Link href="/">Sentiment de Marché</Link>
            <span className={styles.brandSep}>/</span>
            <span>S&amp;P 500</span>
          </div>
          <button
            className={styles.iconBtn}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title="Thème"
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>

        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>^GSPC · S&amp;P 500 INDEX</div>
            <h1 className={styles.title}>
              S&amp;P <em>500</em>
            </h1>
          </div>
          <div className={styles.lastUpdate}>
            {stats ? `Mis à jour · ${fmtDate(stats.last.t)}` : "— —"}
          </div>
        </div>

        {loading && (
          <div className={styles.status}>
            <span className={styles.spinner} />
            Chargement des données Yahoo Finance…
            <br />
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              Yahoo Finance · plusieurs sources tentées en cascade
            </span>
          </div>
        )}

        {!loading && error && (
          <div className={styles.status}>
            <strong>Impossible de charger les données.</strong>
            <br />
            Yahoo Finance bloque les appels directs depuis le navigateur (CORS)
            et tous les proxies publics ont échoué.
            <div className={styles.errDetail}>
              {error.message}
              {error.attempts && error.attempts.length > 0 && (
                <>
                  <br />
                  <br />
                  Tentatives :
                  <br />
                  {error.attempts.map((a, i) => (
                    <span key={i}>
                      · {a}
                      <br />
                    </span>
                  ))}
                </>
              )}
            </div>
            <button className={styles.retryBtn} onClick={boot}>
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && data && slice && stats && (
          <>
            <div className={styles.quoteRow}>
              <div>
                <span className={`${styles.quotePrice} ${styles.mono}`}>
                  {fmtPrice(stats.last.c)}
                </span>
                <span className={styles.quoteCurrency}>{currency}</span>
              </div>
              <div
                className={`${styles.quoteDelta} ${
                  stats.dayDelta >= 0 ? styles.up : styles.down
                }`}
              >
                {stats.dayDelta >= 0 ? "+" : "−"}
                {fmtPrice(Math.abs(stats.dayDelta))} &nbsp;
                {stats.dayDelta >= 0 ? "+" : "−"}
                {Math.abs(stats.dayDeltaPct).toFixed(2)}%
                <span className={styles.quoteDeltaSuffix}>/ jour</span>
              </div>
            </div>

            <div className={styles.metaRow}>
              <span>
                <b className={styles.mono}>{fmtPrice(stats.periodDelta)}</b>
                <span className={styles.mono}>
                  ({stats.periodDelta >= 0 ? "+" : "−"}
                  {Math.abs(stats.periodDeltaPct).toFixed(1)}%) sur la période
                </span>
              </span>
              <span>
                <b>52s haut</b>
                <span className={styles.mono}>{fmtPrice(stats.high52)}</span>
              </span>
              <span>
                <b>52s bas</b>
                <span className={styles.mono}>{fmtPrice(stats.low52)}</span>
              </span>
            </div>

            <div className={styles.chartCard}>
              <div className={styles.chartHead}>
                <div className={styles.chartTitle}>
                  {SYMBOL}{" "}
                  <small>S&amp;P 500 Index · cours quotidien</small>
                </div>
                <div className={styles.rangeToggle}>
                  {RANGES.map((r) => (
                    <button
                      key={r.k}
                      className={`${styles.rangeBtn} ${
                        r.k === rangeKey ? styles.active : ""
                      }`}
                      onClick={() => setRangeKey(r.k)}
                    >
                      {r.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.price}`} />
                  Cours
                  <span className={styles.legendVal}>
                    {fmtPrice(stats.last.c)}
                  </span>
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.mm50}`} />
                  MM50
                  <span className={styles.legendVal}>
                    {stats.lastMM50 != null ? fmtPrice(stats.lastMM50) : "—"}
                  </span>
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.mm200}`} />
                  MM200
                  <span className={styles.legendVal}>
                    {stats.lastMM200 != null ? fmtPrice(stats.lastMM200) : "—"}
                  </span>
                </span>
              </div>
              <Chart
                points={slice.points}
                mm50={slice.mm50}
                mm200={slice.mm200}
              />
            </div>

            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Cours / MM50</div>
                <div className={styles.statValue}>
                  {stats.lastMM50 != null
                    ? `${
                        (stats.last.c / stats.lastMM50 - 1) * 100 >= 0
                          ? "+"
                          : "−"
                      }${Math.abs(
                        (stats.last.c / stats.lastMM50 - 1) * 100
                      ).toFixed(2)}%`
                    : "—"}
                </div>
                <div className={styles.statSub}>
                  {stats.lastMM50 != null && stats.last.c > stats.lastMM50
                    ? "au-dessus"
                    : stats.lastMM50 != null
                      ? "en dessous"
                      : ""}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Cours / MM200</div>
                <div className={styles.statValue}>
                  {stats.lastMM200 != null
                    ? `${
                        (stats.last.c / stats.lastMM200 - 1) * 100 >= 0
                          ? "+"
                          : "−"
                      }${Math.abs(
                        (stats.last.c / stats.lastMM200 - 1) * 100
                      ).toFixed(2)}%`
                    : "—"}
                </div>
                <div className={styles.statSub}>
                  {stats.lastMM200 != null && stats.last.c > stats.lastMM200
                    ? "au-dessus"
                    : stats.lastMM200 != null
                      ? "en dessous"
                      : ""}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>MM50 vs MM200</div>
                <div className={styles.statValue}>
                  {stats.lastMM50 != null && stats.lastMM200 != null
                    ? `${
                        (stats.lastMM50 / stats.lastMM200 - 1) * 100 >= 0
                          ? "+"
                          : "−"
                      }${Math.abs(
                        (stats.lastMM50 / stats.lastMM200 - 1) * 100
                      ).toFixed(2)}%`
                    : "—"}
                </div>
                <div className={styles.statSub}>
                  {stats.goldenCross ? "tendance haussière" : "tendance baissière"}
                </div>
              </div>
            </div>

            <div className={styles.signalRow}>
              <div>
                <div className={styles.signalEyebrow}>Signal technique</div>
                <div className={styles.signalTitle}></div>
              </div>
              {(() => {
                const bull =
                  stats.goldenCross &&
                  stats.lastMM200 != null &&
                  stats.last.c > stats.lastMM200;
                const bear =
                  !stats.goldenCross &&
                  stats.lastMM200 != null &&
                  stats.last.c < stats.lastMM200;
                const cls = bull
                  ? styles.bull
                  : bear
                    ? styles.bear
                    : styles.neutral;
                const label = bull ? "HAUSSIER" : bear ? "BAISSIER" : "NEUTRE";
                return (
                  <div className={`${styles.signalPill} ${cls}`}>{label}</div>
                );
              })()}
            </div>
          </>
        )}

        <div className={styles.foot}>
          <span>Source · query2.finance.yahoo.com · ^GSPC</span>
        </div>
      </div>
    </div>
  );
}
