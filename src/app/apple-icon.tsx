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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#140018",
          color: "#ffe600",
          fontSize: 58,
          fontWeight: 900,
          border: "8px solid #000",
          boxShadow: "inset 0 0 0 7px #ff2ad4",
        }}
      >
        bab
      </div>
    ),
    size,
  );
}
