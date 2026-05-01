import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          gap: 2,
          padding: "8px 5px 6px",
        }}
      >
        <div style={{ width: 3, height: 7, background: "#cc3a3a", borderRadius: 1 }} />
        <div style={{ width: 3, height: 11, background: "#d18540", borderRadius: 1 }} />
        <div style={{ width: 3, height: 9, background: "#9a9a9a", borderRadius: 1 }} />
        <div style={{ width: 3, height: 14, background: "#a8a040", borderRadius: 1 }} />
        <div style={{ width: 3, height: 17, background: "#2d8a5c", borderRadius: 1 }} />
      </div>
    ),
    size,
  );
}
