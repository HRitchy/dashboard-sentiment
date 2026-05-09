import { ImageResponse } from "next/og";
import { createElement } from "react";

export const dynamic = "force-static";

const bars = [
  { width: 48, height: 112, background: "#cc3a3a", borderRadius: 8 },
  { width: 48, height: 168, background: "#d18540", borderRadius: 8 },
  { width: 48, height: 140, background: "#9a9a9a", borderRadius: 8 },
  { width: 48, height: 220, background: "#a8a040", borderRadius: 8 },
  { width: 48, height: 256, background: "#2d8a5c", borderRadius: 8 },
];

export function GET() {
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 32,
          padding: "120px 90px 110px",
        },
      },
      bars.map((style, index) =>
        createElement("div", { key: index, style }),
      ),
    ),
    { width: 512, height: 512 },
  );
}
