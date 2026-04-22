"use client";

interface Props {
  name: string;
  src: string;
  value: number | null;
  delta: number | null;
  unit?: string;
  format?: (v: number) => string;
  loading?: boolean;
  error?: string;
}

export default function Indicator({
  name,
  src,
  value,
  delta,
  unit,
  format,
  loading,
  error,
}: Props) {
  const displayValue =
    value == null
      ? "—"
      : format
        ? format(value)
        : value.toFixed(value % 1 === 0 ? 0 : 2);

  const sign = delta != null && delta >= 0 ? "+" : "−";
  const arrow = delta != null && delta >= 0 ? "▲" : "▼";
  const absD = delta != null ? Math.abs(delta) : null;
  const deltaText =
    absD == null
      ? error
        ? "indisponible"
        : ""
      : `${arrow} ${sign}${absD.toFixed(absD >= 10 ? 1 : 2)}`;

  return (
    <div className="ind fade-in" style={{ opacity: loading ? 0.4 : 1 }}>
      <div className="ind-head">
        <span className="ind-name">{name}</span>
        <span className="ind-src">{src}</span>
      </div>
      <div className="ind-value">
        <span>{displayValue}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="ind-delta">
        <span className="arrow">{deltaText ? deltaText.slice(0, 1) : ""}</span>
        {deltaText ? deltaText.slice(1) : ""}
      </div>
    </div>
  );
}
