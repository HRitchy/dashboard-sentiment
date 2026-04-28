"use client";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export default function Sparkline({
  values,
  width = 120,
  height = 28,
  className,
}: Props) {
  if (values.length < 2) return null;

  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;

  const stepX = width / (values.length - 1);
  const padY = 2;
  const innerH = height - padY * 2;

  let d = "";
  for (let i = 0; i < values.length; i++) {
    const x = i * stepX;
    const y = padY + innerH * (1 - (values[i] - min) / span);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  }

  const last = values[values.length - 1];
  const lastX = (values.length - 1) * stepX;
  const lastY = padY + innerH * (1 - (last - min) / span);

  const trendUp = last >= values[0];

  return (
    <svg
      className={`sparkline ${className ?? ""}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Tendance ${trendUp ? "haussière" : "baissière"} sur ${values.length} points`}
      preserveAspectRatio="none"
    >
      <path
        d={d.trim()}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
    </svg>
  );
}
