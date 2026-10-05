import { ImageResponse } from "next/og";

export const alt = "blood against blackout — darkness dies at the door";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          color: "#f7efe6",
          background:
            "radial-gradient(circle at 85% 15%, #24102c 0, transparent 30%), radial-gradient(circle at 15% 85%, #e11d2e 0, transparent 35%), #0b0610",
          border: "18px solid #000",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#e11d2e",
            fontSize: 78,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 0.9,
            maxWidth: 900,
          }}
        >
          blood against blackout
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 800 }}>
            darkness dies at the door
          </div>
          <div style={{ display: "flex", color: "#c4adc8", fontSize: 28 }}>
            find aa, na, and ca meetings
          </div>
        </div>
      </div>
    ),
    size,
  );
}
