"use client";

import { useId } from "react";
import type { SentimentState } from "@/lib/types";
import { STATE_LABELS } from "@/lib/classify";
import { useCountUp } from "@/lib/use-count-up";
import Sparkline from "./Sparkline";

export interface SpeedoZone {
  from: number;
  to: number;
  cls: string; // e.g. "seg-euphorie" | "seg-calme" | "seg-neutre" | "seg-stress" | "seg-panique"
}

interface Props {
  name: string;
  value: number | null;
  range: { min: number; max: number };
  zones: SpeedoZone[];
  ticks: number[];
  asOf?: string | null;
  source?: string;
  loading?: boolean;
  error?: string;
  state?: SentimentState | null;
  history?: number[];
  formatValue?: (v: number) => string;
  formatTick?: (v: number) => string;
  compact?: boolean;
}

// Geometry — semi-circle gauge, min on the left, max on the right.
const R = 130; // arc radius (center of the stroke)
const STROKE = 26;
const LABEL_OFFSET = 16;
const LABEL_EXTENT = R + STROKE / 2 + LABEL_OFFSET; // 159
const MARGIN = 12;
const CX = LABEL_EXTENT + MARGIN;
const CY = LABEL_EXTENT + MARGIN;
const VIEW_W = CX * 2;
const VIEW_H = CY + 24;

function valueToAngle(v: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, v));
  const t = (clamped - min) / (max - min);
  return -180 + t * 180;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(r: number, startDeg: number, endDeg: number): string {
  const start = polar(CX, CY, r, startDeg);
  const end = polar(CX, CY, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export default function Speedometer({
  name,
  value,
  range,
  zones,
  ticks,
  asOf,
  source,
  loading,
  error,
  state,
  history,
  formatValue,
  formatTick,
  compact,
}: Props) {
  const { min, max } = range;
  const gradId = useId().replace(/:/g, "-") + "-grad";

  const segs = zones.map((z) => ({
    from: valueToAngle(z.from, min, max),
    to: valueToAngle(z.to, min, max),
    cls: z.cls,
  }));

  // Map zone css classes → CSS variable colors for a continuous gradient.
  const zoneVar: Record<string, string> = {
    "seg-euphorie": "var(--c-euphorie)",
    "seg-calme": "var(--c-calme)",
    "seg-neutre": "var(--ink-3)",
    "seg-stress": "var(--c-stress)",
    "seg-panique": "var(--c-panique)",
  };
  const stops = zones.flatMap((z) => {
    const a = (z.from - min) / (max - min);
    const b = (z.to - min) / (max - min);
    const color = zoneVar[z.cls] ?? "var(--ink-3)";
    return [
      { offset: a, color },
      { offset: b, color },
    ];
  });

  const animatedValue = useCountUp(value);
  const needleAngle = value == null ? null : valueToAngle(value, min, max);

  const displayNumber = animatedValue ?? value;
  const displayValue =
    displayNumber == null
      ? "—"
      : formatValue
        ? formatValue(displayNumber)
        : String(displayNumber);
  const displayTick = formatTick ?? ((v: number) => String(v));

  const isSkeleton = loading && value == null;

  return (
    <div
      className={`speedo fade-in${compact ? " speedo-compact" : ""}${
        isSkeleton ? " speedo-skeleton" : ""
      }`}
      aria-busy={loading || undefined}
    >
      <div className="speedo-head">
        <span className="speedo-name">{name}</span>
        {source ? <span className="speedo-src">{source}</span> : null}
      </div>

      <div className="speedo-stage">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`${name} ${displayValue}${state ? ` · ${STATE_LABELS[state]}` : ""}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              {stops.map((s, i) => (
                <stop
                  key={i}
                  offset={`${(s.offset * 100).toFixed(2)}%`}
                  stopColor={s.color}
                />
              ))}
            </linearGradient>
          </defs>

          {/* Track background */}
          <path
            d={arcPath(R, -180, 0)}
            fill="none"
            stroke="var(--line)"
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />

          {/* Continuous gradient arc */}
          <path
            d={arcPath(R, -180, 0)}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />

          {/* Subtle zone separators (no jarring color blocks) */}
          {segs.slice(0, -1).map((s, i) => {
            const a = s.to;
            const outer = polar(CX, CY, R + STROKE / 2, a);
            const inner = polar(CX, CY, R - STROKE / 2, a);
            return (
              <line
                key={i}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke="var(--bg)"
                strokeWidth={1}
                opacity="0.5"
              />
            );
          })}

          {/* Ticks + numeric labels */}
          {ticks.map((t) => {
            const a = valueToAngle(t, min, max);
            const outer = polar(CX, CY, R + STROKE / 2 + 2, a);
            const inner = polar(CX, CY, R - STROKE / 2 - 2, a);
            const label = polar(CX, CY, R + STROKE / 2 + 16, a);
            return (
              <g key={t} className="speedo-tick">
                <line
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke="var(--bg)"
                  strokeWidth={1.5}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="speedo-tick-label"
                >
                  {displayTick(t)}
                </text>
              </g>
            );
          })}

          {/* Needle */}
          {needleAngle != null && (
            <g
              className="speedo-needle"
              transform={`rotate(${needleAngle + 180} ${CX} ${CY})`}
            >
              <line
                x1={CX}
                y1={CY}
                x2={CX - R + 8}
                y2={CY}
                stroke="var(--ink)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <circle cx={CX} cy={CY} r={7} fill="var(--ink)" />
              <circle cx={CX} cy={CY} r={3} fill="var(--bg)" />
            </g>
          )}
        </svg>

        <div className="speedo-readout">
          <div className="speedo-value">{displayValue}</div>
          {state ? (
            <div
              className={`speedo-state w-${state.toLowerCase()}`}
              aria-live="polite"
            >
              {STATE_LABELS[state]}
            </div>
          ) : value != null ? (
            <div className="speedo-state speedo-state-empty">—</div>
          ) : null}
          {history && history.length > 1 ? (
            <div
              className={`speedo-spark${state ? ` w-${state.toLowerCase()}` : ""}`}
            >
              <Sparkline values={history} width={140} height={28} />
            </div>
          ) : null}
        </div>
      </div>

      {(error || asOf) && (
        <div className="speedo-foot">
          {error ? <span className="speedo-err">{error}</span> : null}
          {!error && asOf ? (
            <span className="speedo-asof">
              Mis à jour {new Date(asOf).toLocaleDateString("fr-FR")}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
