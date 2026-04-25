"use client";

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
  formatValue?: (v: number) => string;
  formatTick?: (v: number) => string;
  compact?: boolean;
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

function valueToAngle(v: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, v));
  const t = (clamped - min) / (max - min); // 0..1
  // -180° (left) → 0° (right). 0° points right in SVG.
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
  formatValue,
  formatTick,
  compact,
}: Props) {
  const { min, max } = range;

  const segs = zones.map((z) => ({
    from: valueToAngle(z.from, min, max),
    to: valueToAngle(z.to, min, max),
    cls: z.cls,
  }));

  const needleAngle = value == null ? null : valueToAngle(value, min, max);

  const displayValue =
    value == null ? "—" : formatValue ? formatValue(value) : String(value);
  const displayTick = formatTick ?? ((v: number) => String(v));

  return (
    <div
      className={`speedo fade-in${compact ? " speedo-compact" : ""}`}
      style={{ opacity: loading && value == null ? 0.4 : 1 }}
    >
      <div className="speedo-head">
        <span className="speedo-name">{name}</span>
        {source ? <span className="speedo-src">{source}</span> : null}
      </div>

      <div className="speedo-stage">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`${name} ${displayValue}`}
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
