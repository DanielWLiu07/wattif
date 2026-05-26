import { Buildings, Users, Cpu, Lightning, Sun, Wind, BatteryCharging, Broadcast } from "@phosphor-icons/react";

interface FlowDiagramProps {
  visible: boolean;
}

const PLAIN_CHIPS = [
  { label: "Solar",     Icon: Sun,             color: "#fbbf24" },
  { label: "Wind",      Icon: Wind,            color: "#60a5fa" },
  { label: "Battery",   Icon: BatteryCharging, color: "#34d399" },
  { label: "Microgrid", Icon: Broadcast,       color: "hsl(72 95% 50%)" },
] as const;

export function FlowDiagram({ visible }: FlowDiagramProps) {
  const slide = (from: string, delay: number): React.CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "none" : from,
    transition: `opacity 0.5s ease ${delay}ms, transform 0.58s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
  });

  // ── Tight interlocking cluster — sizes & offsets hand-tuned so the numbers
  //    nest into each other's negative space like puzzle pieces, not spread out.
  //    Coordinate box is 640 × 360; everything is packed inside it.
  const LABEL: React.CSSProperties = {
    fontFamily: "monospace", fontSize: 9,
    letterSpacing: "0.12em", textTransform: "uppercase",
    color: "hsl(var(--foreground) / 0.34)",
    display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
  };

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 flex h-full w-full flex-col items-center justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.985)",
        filter: visible ? "blur(0px)" : "blur(3px)",
        transition: "opacity 0.55s ease, transform 0.55s ease, filter 0.55s ease",
        willChange: "opacity, transform, filter",
      }}
    >
      {/* Cluster wrapper — fixed coordinate canvas centred on screen */}
      <div style={{ position: "relative", width: 640, height: 392 }}>

        {/* Header — sits just above the cluster, left-aligned to 419,582 */}
        <div
          style={{
            position: "absolute", left: 0, top: -8,
            opacity: visible ? 1 : 0,
            transform: visible ? "none" : "translateY(8px)",
            transition: "opacity 0.42s ease, transform 0.42s ease",
          }}
        >
          <span className="label" style={{ color: "hsl(var(--brand))", display: "block", marginBottom: "0.3rem" }}>
            How WattIf Works
          </span>
          <h2
            className="font-display font-bold leading-tight text-foreground"
            style={{ fontSize: "clamp(1.5rem, 2vw, 2rem)", letterSpacing: "-0.025em" }}
          >
            An AI that sites the grid —{" "}
            <span style={{ color: "hsl(var(--brand))" }}>live.</span>
          </h2>
        </div>

        {/* hairline connector tucked behind the numbers (cluster spine) */}
        <svg
          aria-hidden
          viewBox="0 0 640 392"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            pointerEvents: "none",
            opacity: visible ? 0.16 : 0,
            transition: "opacity 0.7s ease 420ms",
          }}
        >
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="hsl(72 95% 50%)" />
            </marker>
          </defs>
          <path
            d="M 70,150 C 150,210 230,150 300,210 S 430,230 470,205"
            stroke="hsl(72 95% 45%)" strokeWidth="1" fill="none"
            strokeDasharray="3 5" markerEnd="url(#arr)"
          />
        </svg>

        {/* ── 01 · City Data — top-left anchor ── */}
        <div style={{ position: "absolute", left: 0, top: 78 }}>
          <div style={slide("translate(-28px,-18px)", 60)}>
            <div style={{
              fontFamily: "monospace", fontSize: "4.4rem", fontWeight: 800,
              lineHeight: 0.82, letterSpacing: "-0.04em",
              color: "hsl(var(--foreground))",
            }}>
              419,582
            </div>
            <div style={{ ...LABEL, marginTop: 6 }}>
              <Buildings size={10} color="#60a5fa" weight="bold" />
              01 · City Data · buildings mapped
            </div>
          </div>
        </div>

        {/* ── 02 · Simulated Agents — tucked under 419,582, indented right ── */}
        <div style={{ position: "absolute", left: 40, top: 196 }}>
          <div style={slide("translate(-22px,12px)", 150)}>
            <div style={{
              fontFamily: "monospace", fontSize: "3.1rem", fontWeight: 800,
              lineHeight: 0.82, letterSpacing: "-0.035em",
              color: "hsl(var(--foreground) / 0.72)",
            }}>
              8,001
            </div>
            <div style={{ ...LABEL, marginTop: 5 }}>
              <Users size={10} color="#a78bfa" weight="bold" />
              02 · Agents · residents modelled
            </div>
          </div>
        </div>

        {/* ── 03 · AI Planner — nestles to the right of 8,001, baseline lower ── */}
        <div style={{ position: "absolute", left: 232, top: 214 }}>
          <div style={slide("translate(-12px,22px)", 230)}>
            <div style={{
              fontFamily: "monospace", fontSize: "2.7rem", fontWeight: 800,
              lineHeight: 0.82, letterSpacing: "-0.04em",
              color: "hsl(var(--foreground) / 0.6)",
            }}>
              583
            </div>
            <div style={{ ...LABEL, marginTop: 5 }}>
              <Cpu size={10} color="hsl(72 95% 42%)" weight="bold" />
              03 · AI Planner · sites analyzed
            </div>
          </div>
        </div>

        {/* ── 04 · Sited Infrastructure — HERO, packed against the right edge,
              vertically straddling the cluster so it interlocks, not floats ── */}
        <div style={{ position: "absolute", right: 0, top: 70, textAlign: "right" }}>
          <div style={slide("translate(34px,0) scale(0.94)", 300)}>
            <div style={{
              fontFamily: "monospace", fontSize: "8.6rem", fontWeight: 900,
              lineHeight: 0.78, letterSpacing: "-0.06em",
              color: "hsl(var(--brand))",
            }}>
              182
            </div>
            <div style={{ ...LABEL, marginTop: 8, justifyContent: "flex-end" }}>
              <Lightning size={10} color="#34d399" weight="bold" />
              04 · Sited Infrastructure · assets placed
            </div>

            {/* Plain text infra chips — NO boxes, NO borders */}
            <div style={{
              marginTop: 12,
              display: "flex", gap: 16, justifyContent: "flex-end", flexWrap: "wrap",
            }}>
              {PLAIN_CHIPS.map(({ label, Icon, color }, i) => (
                <span
                  key={label}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontFamily: "monospace", fontSize: 11, fontWeight: 600,
                    color,
                    opacity: visible ? 1 : 0,
                    transform: visible ? "none" : "translateY(6px)",
                    transition: `opacity 0.38s ease ${400 + i * 55}ms, transform 0.42s cubic-bezier(0.34,1.56,0.64,1) ${400 + i * 55}ms`,
                  }}
                >
                  <Icon size={12} color={color} weight="bold" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
