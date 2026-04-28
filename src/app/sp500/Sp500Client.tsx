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
import { useTheme } from "@/lib/use-theme";
import styles from "./page.module.css";

const SYMBOL = "^GSPC";

type RangeKey = "6m" | "ytd" | "1y" | "5y" | "10y" | "max";

type Point = { t: number; c: number };

type FetchResult = {
  points: Point[];
  meta: { currency?: string; symbol?: string };
  source: string;
};

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
  const res = await fetch("/api/sp500", { cache: "no-store" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as FetchResult;
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
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

    // Reduce-based min/max — safe with very large arrays (no spread overflow).
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const v = points[i].c;
      if (v < minY) minY = v;
      if (v > maxY) maxY = v;
    }
    for (let i = 0; i < mm50.length; i++) {
      const v = mm50[i];
      if (v != null) {
        if (v < minY) minY = v;
        if (v > maxY) maxY = v;
      }
    }
    for (let i = 0; i < mm200.length; i++) {
      const v = mm200[i];
      if (v != null) {
        if (v < minY) minY = v;
        if (v > maxY) maxY = v;
      }
    }
    if (!Number.isFinite(minY)) minY = 0;
    if (!Number.isFinite(maxY)) maxY = 1;
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
        role="img"
        aria-label="Cours du S&P 500"
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
        <line
          className={`${styles.crosshairH} ${hover != null ? styles.on : ""}`}
          x1={layout.PAD_L}
          x2={layout.W - layout.PAD_R}
          y1={hoverYPrice}
          y2={hoverYPrice}
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
  const { theme, toggle: toggleTheme } = useTheme();
  const [rangeKey, setRangeKey] = useState<RangeKey>("1y");
  const [data, setData] = useState<{
    points: Point[];
    mm50All: (number | null)[];
    mm200All: (number | null)[];
    meta: { currency?: string; symbol?: string };
    source: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // One-shot client fetch on mount. The chart UI needs the Retry button to
    // re-trigger imperatively, so Server Components don't fit here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    let high52 = -Infinity;
    let low52 = Infinity;
    for (let i = 0; i < last252.length; i++) {
      const v = last252[i].c;
      if (v > high52) high52 = v;
      if (v < low52) low52 = v;
    }

    const lastMM50 = slice.mm50[slice.mm50.length - 1];
    const lastMM200 = slice.mm200[slice.mm200.length - 1];

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
    };
  }, [data, slice]);

  const currency = data?.meta.currency || "USD";

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.brand}>
            <Link href="/">Sentiment de Marché</Link>
            <span className={styles.brandSep}>/</span>
            <span>S&amp;P 500</span>
          </div>
          <button
            className={styles.iconBtn}
            onClick={toggleTheme}
            title="Thème"
            aria-label={`Basculer en thème ${theme === "light" ? "sombre" : "clair"}`}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>

        <div className={styles.header}>
          <div className={styles.lastUpdate}>
            {stats ? `Mis à jour · ${fmtDate(stats.last.t)}` : "— —"}
          </div>
        </div>

        {loading && (
          <div className={styles.status} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            Chargement des données…
          </div>
        )}

        {!loading && error && (
          <div className={styles.status} role="alert">
            <strong>Impossible de charger les données.</strong>
            <div className={styles.errDetail}>{error}</div>
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
                <div className={styles.rangeToggle} role="group" aria-label="Plage temporelle">
                  {RANGES.map((r) => (
                    <button
                      key={r.k}
                      className={`${styles.rangeBtn} ${
                        r.k === rangeKey ? styles.active : ""
                      }`}
                      onClick={() => setRangeKey(r.k)}
                      aria-pressed={r.k === rangeKey}
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
          </>
        )}

        <div className={styles.foot}>
          <span>Source · Yahoo Finance · {SYMBOL}{data ? ` · via ${data.source}` : ""}</span>
        </div>
      </div>
    </div>
  );
}
