"use client";

import { NFCI_RANGE, NFCI_THRESHOLDS } from "@/lib/types";

interface Props {
  value: number | null;
  asOf?: string | null;
  source?: string;
  loading?: boolean;
  error?: string;
}

// Geometry — semi-circle gauge, min on the left, max on the right.
const R = 130; // arc radius (center of the stroke)
const STROKE = 26;
const LABEL_OFFSET = 16; // distance from arc to tick label
const LABEL_EXTENT = R + STROKE / 2 + LABEL_OFFSET; // 159
const MARGIN = 12; // viewBox margin beyond labels
const CX = LABEL_EXTENT + MARGIN;
const CY = LABEL_EXTENT + MARGIN;
const VIEW_W = CX * 2;
const VIEW_H = CY + 24; // small strip below the diameter

function valueToAngle(v: number): number {
  const { min, max } = NFCI_RANGE;
  const clamped = Math.min(max, Math.max(min, v));
  const t = (clamped - min) / (max - min); // 0..1
  // -90° (left) → +90° (right). We use degrees where 0° points right.
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
  // Sweep flag 1 because we go clockwise from start (smaller deg) to end (larger deg).
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export default function Speedometer({
  value,
  asOf,
  source,
  loading,
  error,
}: Props) {
  // Zone boundaries in degrees along the arc.
  const segs: Array<{ from: number; to: number; cls: string }> = [
    {
      from: valueToAngle(NFCI_RANGE.min),
      to: valueToAngle(NFCI_THRESHOLDS.calme),
      cls: "seg-calme",
    },
    {
      from: valueToAngle(NFCI_THRESHOLDS.calme),
      to: valueToAngle(NFCI_THRESHOLDS.normal),
      cls: "seg-normal",
    },
    {
      from: valueToAngle(NFCI_THRESHOLDS.normal),
      to: valueToAngle(NFCI_THRESHOLDS.stress),
      cls: "seg-stress",
    },
    {
      from: valueToAngle(NFCI_THRESHOLDS.stress),
      to: valueToAngle(NFCI_RANGE.max),
      cls: "seg-crise",
    },
  ];

  // Tick marks for every integer in the range.
  const ticks: number[] = [];
  for (let i = NFCI_RANGE.min; i <= NFCI_RANGE.max; i++) ticks.push(i);

  const needleAngle = value == null ? null : valueToAngle(value);

  const displayValue =
    value == null
      ? "—"
      : (value >= 0 ? "+" : "") + String(value);

  return (
    <div
      className="speedo fade-in"
      style={{ opacity: loading && value == null ? 0.4 : 1 }}
    >
      <div className="speedo-head">
        <span className="speedo-name">Conditions de marché</span>
        <span className="speedo-src">{source ?? "FRED · NFCI"}</span>
      </div>

      <div className="speedo-stage">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`NFCI ${displayValue}`}
        >
          {/* Track background */}
          <path
            d={arcPath(R, -180, 0)}
            fill="none"
            stroke="var(--line)"
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />

          {/* Colored zones */}
          {segs.map((s, i) => (
            <path
              key={i}
              className={`speedo-seg ${s.cls}`}
              d={arcPath(R, s.from, s.to)}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="butt"
            />
          ))}

          {/* Ticks + numeric labels */}
          {ticks.map((t) => {
            const a = valueToAngle(t);
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
                  {t}
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
