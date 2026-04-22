"use client";

interface Props {
  name: string;
  src: string;
  value: number | null;
  unit?: string;
  format?: (v: number) => string;
  loading?: boolean;
  error?: string;
}

export default function Indicator({
  name,
  src,
  value,
  unit,
  format,
  loading,
}: Props) {
  const displayValue =
    value == null
      ? "—"
      : format
        ? format(value)
        : value.toFixed(value % 1 === 0 ? 0 : 2);

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
    </div>
  );
}
