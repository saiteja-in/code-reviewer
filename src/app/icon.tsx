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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#171717",
          color: "#fafafa",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        AI
      </div>
    ),
    { ...size },
  );
}
