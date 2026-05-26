import { ImageResponse } from "next/og";

export const alt =
  "Quad — bug reports straight to your AI coding agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          background:
            "linear-gradient(135deg, #06070c 0%, #0a0c14 55%, #06070c 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          color: "#f5f6fa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <QuadGlyph size={88} />
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Quad
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              maxWidth: 980,
            }}
          >
            Bug reports straight to your AI coding agent.
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#a3a8c0",
              lineHeight: 1.4,
              maxWidth: 980,
            }}
          >
            Self-hosted MIT. Video + audio + DOM trail flow through MCP into
            Claude Code with zero context loss.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#6b7088",
            letterSpacing: "0.02em",
          }}
        >
          <div style={{ display: "flex" }}>github.com/Conscience-Technology/Quad</div>
          <div style={{ display: "flex" }}>MIT · self-host first</div>
        </div>
      </div>
    ),
    size,
  );
}

function QuadGlyph({ size }: { size: number }) {
  const gap = size * 0.08;
  const tileSize = (size - gap) / 2;
  const border = `${Math.max(2, tileSize * 0.06)}px solid rgba(138,144,168,0.55)`;
  const radius = tileSize * 0.18;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        gap,
      }}
    >
      <div style={{ display: "flex", gap, flex: 1 }}>
        <div
          style={{
            flex: 1,
            border,
            borderRadius: radius,
          }}
        />
        <div
          style={{
            flex: 1,
            background: "#8b7cf6",
            borderRadius: radius,
          }}
        />
      </div>
      <div style={{ display: "flex", gap, flex: 1 }}>
        <div style={{ flex: 1, border, borderRadius: radius }} />
        <div style={{ flex: 1, border, borderRadius: radius }} />
      </div>
    </div>
  );
}
