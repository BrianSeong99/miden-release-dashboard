import React from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

// Static artwork: release versions and readiness belong to the live dashboard.
// Regenerate with: npx tsx scripts/generate-og-image.tsx
async function main() {
  const image = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#eaeaea", padding: 28 }}>
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#ffffff", borderRadius: 36 }}>
        <div style={{ position: "absolute", top: 44, left: 48, display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="46" height="46" viewBox="0 0 24 24"><rect width="24" height="24" rx="12" fill="#171717" /><path d="M6 17V7h2.4l3.6 5.2L15.6 7H18v10h-2.3v-6.2L12 15.4 8.3 10.8V17H6z" fill="#ffffff" /></svg>
          <span style={{ fontSize: 26, color: "#171717" }}>Miden</span>
        </div>
        <div style={{ position: "absolute", top: 48, right: 48, display: "flex", borderRadius: 30, padding: "10px 18px", background: "#f7f7f7", color: "#666666", fontSize: 18 }}>Ecosystem overview</div>

        <div style={{ position: "absolute", top: 155, left: 48, width: 660, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -4, lineHeight: 1.08, color: "#171717" }}>Release</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -4, lineHeight: 1.08, color: "#171717" }}>Dashboard</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 23, lineHeight: 1.5, color: "#737373" }}>
            <span>Track release readiness across</span><span>the Miden ecosystem.</span>
          </div>
        </div>

        <div style={{ position: "absolute", right: 48, top: 150, width: 388, height: 270, display: "flex", borderRadius: 28, background: "#f7f7f7" }}>
          <svg width="388" height="270" viewBox="0 0 388 270" style={{ position: "absolute", top: 0, left: 0 }}>
            <path d="M178 62 H212 Q228 62 228 78 V116 Q228 132 244 132 H270" fill="none" stroke="#ec704f" strokeWidth="3" />
            <path d="M270 160 V191 Q270 208 253 208 H192" fill="none" stroke="#ec704f" strokeWidth="3" />
            <path d="M264 126 L271 132 L264 138 M199 202 L192 208 L199 214" fill="none" stroke="#ec704f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ position: "absolute", left: 24, top: 28, width: 164, height: 68, display: "flex", alignItems: "center", paddingLeft: 20, borderRadius: 18, background: "#ffffff", border: "1px solid #eeeeee" }}>
            <span style={{ display: "flex", background: "#ffedd5", color: "#9a3412", padding: "6px 14px", borderRadius: 22, fontSize: 21 }}>Protocol</span>
          </div>
          <div style={{ position: "absolute", left: 251, top: 100, width: 113, height: 68, display: "flex", justifyContent: "center", alignItems: "center", borderRadius: 18, background: "#ffffff", border: "1px solid #eeeeee" }}>
            <span style={{ display: "flex", background: "#e0f2fe", color: "#0369a1", padding: "6px 14px", borderRadius: 22, fontSize: 21 }}>SDKs</span>
          </div>
          <div style={{ position: "absolute", left: 24, top: 174, width: 168, height: 68, display: "flex", alignItems: "center", paddingLeft: 20, borderRadius: 18, background: "#171717" }}>
            <span style={{ display: "flex", background: "#ccfbf1", color: "#115e59", padding: "6px 14px", borderRadius: 22, fontSize: 21 }}>Apps</span>
          </div>
        </div>

        <div style={{ position: "absolute", left: 48, right: 48, bottom: 40, display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 28, borderTop: "1px solid #ededed" }}>
          <div style={{ display: "flex", gap: 28, fontSize: 19, color: "#525252" }}>
            <span>Releases</span><span>Dependencies</span><span>Open work</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderRadius: 28, background: "#ec704f", color: "#171717", fontSize: 18 }}>
            <span>Explore the dashboard</span><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="#171717" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
  await mkdir("public", { recursive: true });
  await writeFile("public/og-image.png", Buffer.from(await image.arrayBuffer()));
  console.log("Created public/og-image.png (1200 × 630)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
