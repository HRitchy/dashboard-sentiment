import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 12,
          padding: "44px 32px 40px",
        }}
      >
        <div style={{ width: 18, height: 42, background: "#cc3a3a", borderRadius: 3 }} />
        <div style={{ width: 18, height: 62, background: "#d18540", borderRadius: 3 }} />
        <div style={{ width: 18, height: 52, background: "#9a9a9a", borderRadius: 3 }} />
        <div style={{ width: 18, height: 82, background: "#a8a040", borderRadius: 3 }} />
        <div style={{ width: 18, height: 96, background: "#2d8a5c", borderRadius: 3 }} />
      </div>
    ),
    size,
  );
}
