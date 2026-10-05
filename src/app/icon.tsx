import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0610",
          color: "#e11d2e",
          fontSize: 116,
          fontWeight: 900,
          letterSpacing: -4,
          border: "18px solid #000",
          boxShadow: "0 0 0 14px #24102c",
        }}
      >
        bab
      </div>
    ),
    size,
  );
}
