import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The picture shown when a WorshipHQ link is shared on WhatsApp, Facebook, X or LinkedIn. Built once at build time.
export const alt = "WorshipHQ - church management software with face, palm and fingerprint check-in";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/icon.png"), "base64");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0b2b26 0%, #123d36 55%, #0d7377 100%)",
          color: "#faf8f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={`data:image/png;base64,${logo}`} width={84} height={84} style={{ borderRadius: 18 }} />
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
            Worship<span style={{ color: "#e7c873" }}>HQ</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.08, maxWidth: 980 }}>
            Members walk in. Attendance is done.
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#d9e6e2", maxWidth: 1000, lineHeight: 1.35 }}>
            Face, palm and fingerprint check-in at the church door, plus members, giving, SMS and accounting in one place.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#b8ccc7" }}>
          <div style={{ display: "flex" }}>Church management software for Ghana</div>
          <div style={{ display: "flex", color: "#e7c873", fontWeight: 700 }}>worshiphq.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
