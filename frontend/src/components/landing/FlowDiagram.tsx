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

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 flex h-full w-full flex-col items-start justify-center px-16"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.985)",
        filter: visible ? "blur(0px)" : "blur(3px)",
        transition: "opacity 0.55s ease, transform 0.55s ease, filter 0.55s ease",
        willChange: "opacity, transform, filter",
      }}
    >
      {/* Header */}
      <div
        className="mb-6"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(8px)",
          transition: "opacity 0.42s ease, transform 0.42s ease",
        }}
      >
        <span className="label" style={{ color: "hsl(var(--brand))", display: "block", marginBottom: "0.4rem" }}>
          How WattIf Works
        </span>
        <h2
          className="font-display font-bold leading-tight text-foreground"
          style={{ fontSize: "clamp(1.8rem, 2.4vw, 2.5rem)", letterSpacing: "-0.025em" }}
        >
          An AI that sites the grid —{" "}
          <span style={{ color: "hsl(var(--brand))" }}>live.</span>
        </h2>
      </div>

      {/* ── Typographic collage — absolute positioned, no grid, no boxes ── */}
      <div style={{ position: "relative", width: "100%", height: 340 }}>

        {/* ── 01 · City Data — upper-left ── */}
        {/* outer: positioning; inner: animation transform */}
        <div style={{ position: "absolute", left: 0, top: "4%" }}>
          <div style={slide("translate(-52px,-28px)", 40)}>
            <div style={{
              fontFamily: "monospace", fontSize: "4.8rem", fontWeight: 800,
              lineHeight: 0.88, letterSpacing: "-0.03em",
              color: "hsl(var(--foreground))",
            }}>
              419,582
            </div>
            <div style={{
              marginTop: 8, fontFamily: "monospace", fontSize: 9,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "hsl(var(--foreground) / 0.32)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Buildings size={10} color="#60a5fa" weight="bold" />
              01 · City Data · buildings mapped
            </div>
          </div>
        </div>

        {/* ── 02 · Simulated Agents — middle-left, offset down ── */}
        <div style={{ position: "absolute", left: "1%", top: "50%", transform: "translateY(-50%)" }}>
          <div style={slide("translate(-44px,14px)", 130)}>
            <div style={{
              fontFamily: "monospace", fontSize: "3.8rem", fontWeight: 800,
              lineHeight: 0.88, letterSpacing: "-0.03em",
              color: "hsl(var(--foreground) / 0.75)",
            }}>
              8,001
            </div>
            <div style={{
              marginTop: 7, fontFamily: "monospace", fontSize: 9,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "hsl(var(--foreground) / 0.32)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Users size={10} color="#a78bfa" weight="bold" />
              02 · Simulated Agents · residents modelled
            </div>
          </div>
        </div>

        {/* ── 03 · AI Planner — lower-center ── */}
        <div style={{ position: "absolute", left: "27%", bottom: "5%" }}>
          <div style={slide("translate(-20px,38px)", 200)}>
            <div style={{
              fontFamily: "monospace", fontSize: "4.3rem", fontWeight: 800,
              lineHeight: 0.88, letterSpacing: "-0.04em",
              color: "hsl(var(--foreground) / 0.65)",
            }}>
              583
            </div>
            <div style={{
              marginTop: 7, fontFamily: "monospace", fontSize: 9,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "hsl(var(--foreground) / 0.32)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Cpu size={10} color="hsl(72 95% 42%)" weight="bold" />
              03 · AI Planner · sites analyzed
            </div>
          </div>
        </div>

        {/* ── 04 · Sited Infrastructure — right, HERO ── */}
        <div style={{
          position: "absolute", right: 0, top: "50%",
          transform: "translateY(-50%)",
          textAlign: "right",
        }}>
          <div style={slide("translate(56px,0) scale(0.92)", 280)}>
            {/* Hero number */}
            <div style={{
              fontFamily: "monospace", fontSize: "clamp(7rem, 9.5vw, 11rem)", fontWeight: 900,
              lineHeight: 0.82, letterSpacing: "-0.05em",
              color: "hsl(var(--brand))",
            }}>
              182
            </div>
            <div style={{
              marginTop: 10, fontFamily: "monospace", fontSize: 9,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "hsl(var(--foreground) / 0.32)",
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5,
            }}>
              <Lightning size={10} color="#34d399" weight="bold" />
              04 · Sited Infrastructure · assets placed
            </div>

            {/* Plain text infra chips — NO boxes, NO borders */}
            <div style={{
              marginTop: 14,
              display: "flex", gap: 18, justifyContent: "flex-end", flexWrap: "wrap",
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
                    transition: `opacity 0.38s ease ${380 + i * 55}ms, transform 0.42s cubic-bezier(0.34,1.56,0.64,1) ${380 + i * 55}ms`,
                  }}
                >
                  <Icon size={12} color={color} weight="bold" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── optional hairline flow arrow from 419,582 → 182 (not a box, just a line) ── */}
        <svg
          aria-hidden
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            pointerEvents: "none",
            opacity: visible ? 0.12 : 0,
            transition: "opacity 0.7s ease 400ms",
          }}
        >
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="hsl(72 95% 50%)" />
            </marker>
          </defs>
          {/* rough arc: city-data (left, ~top-20%) → sited-infra (right, mid) */}
          <path
            d="M 200,80 C 400,40 700,200 820,170"
            stroke="hsl(72 95% 50%)"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4 5"
            markerEnd="url(#arr)"
          />
        </svg>
      </div>
    </div>
  );
}
