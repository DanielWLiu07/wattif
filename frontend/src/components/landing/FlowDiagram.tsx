import { Buildings, Users, Cpu, Lightning, Sun, Wind, BatteryCharging, Broadcast } from "@phosphor-icons/react";

interface FlowDiagramProps {
  visible: boolean;
}

const GRID_H = 340; // 170px per row

const CHIPS = [
  { label: "Solar",    Icon: Sun,            color: "#fbbf24" },
  { label: "Wind",     Icon: Wind,           color: "#60a5fa" },
  { label: "Battery",  Icon: BatteryCharging, color: "#34d399" },
  { label: "Microgrid",Icon: Broadcast,      color: "hsl(72 95% 50%)" },
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
        className="mb-7"
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

      {/* ── Typographic 2×2 number composition ── */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "44% 56%",
          gridTemplateRows: `${GRID_H / 2}px ${GRID_H / 2}px`,
          width: "100%",
          height: GRID_H,
        }}
      >
        {/* Hairline cross — vertical */}
        <div aria-hidden style={{
          position: "absolute", top: 0, bottom: 0, left: "44%", width: 1,
          background: "hsl(var(--foreground) / 0.07)", pointerEvents: "none", zIndex: 1,
        }} />
        {/* Hairline cross — horizontal */}
        <div aria-hidden style={{
          position: "absolute", left: 0, right: 0, top: "50%", height: 1,
          background: "hsl(var(--foreground) / 0.07)", pointerEvents: "none", zIndex: 1,
        }} />

        {/* ── 01 City Data — top-left ── */}
        <div
          style={{
            gridColumn: 1, gridRow: 1,
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 32px 0 0",
            ...slide("translate(-52px,-32px)", 40),
          }}
        >
          <div style={{
            fontFamily: "monospace", fontSize: 9, fontWeight: 600,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "hsl(var(--foreground) / 0.3)",
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          }}>
            <Buildings size={11} color="#60a5fa" weight="bold" />
            01 · City Data
          </div>
          <div style={{
            fontFamily: "monospace", fontSize: "4.5rem", fontWeight: 800,
            lineHeight: 0.88, letterSpacing: "-0.03em",
            color: "hsl(var(--foreground))",
          }}>
            419,582
          </div>
          <div style={{ fontSize: 11, color: "hsl(var(--foreground) / 0.38)", marginTop: 9, fontFamily: "monospace" }}>
            buildings mapped
          </div>
        </div>

        {/* ── 04 Sited Infrastructure — top-right, HERO ── */}
        <div
          style={{
            gridColumn: 2, gridRow: 1,
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 0 0 40px",
            ...slide("translate(52px,-32px)", 280),
          }}
        >
          <div style={{
            fontFamily: "monospace", fontSize: 9, fontWeight: 600,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "hsl(var(--foreground) / 0.3)",
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          }}>
            <Lightning size={11} color="#34d399" weight="bold" />
            04 · Sited Infrastructure
          </div>
          {/* Hero number in volt */}
          <div style={{
            fontFamily: "monospace", fontSize: "8rem", fontWeight: 900,
            lineHeight: 0.85, letterSpacing: "-0.05em",
            color: "hsl(var(--brand))",
          }}>
            182
          </div>
          <div style={{ fontSize: 12, color: "hsl(var(--foreground) / 0.38)", marginTop: 10, fontFamily: "monospace" }}>
            clean-energy assets placed
          </div>
        </div>

        {/* ── 02 Simulated Agents — bottom-left ── */}
        <div
          style={{
            gridColumn: 1, gridRow: 2,
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 32px 0 0",
            ...slide("translate(-52px,32px)", 120),
          }}
        >
          <div style={{
            fontFamily: "monospace", fontSize: "3.9rem", fontWeight: 800,
            lineHeight: 0.88, letterSpacing: "-0.03em",
            color: "hsl(var(--foreground))",
          }}>
            8,001
          </div>
          <div style={{
            fontSize: 11, color: "hsl(var(--foreground) / 0.38)", marginTop: 9, fontFamily: "monospace",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Users size={11} color="#a78bfa" weight="bold" />
            02 · Simulated Agents · residents modelled
          </div>
        </div>

        {/* ── 03 AI Planner — bottom-right ── */}
        <div
          style={{
            gridColumn: 2, gridRow: 2,
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 0 0 40px",
            ...slide("translate(52px,32px)", 200),
          }}
        >
          <div style={{
            fontFamily: "monospace", fontSize: "5.2rem", fontWeight: 800,
            lineHeight: 0.88, letterSpacing: "-0.04em",
            color: "hsl(var(--foreground))",
          }}>
            583
          </div>
          <div style={{
            fontSize: 11, color: "hsl(var(--foreground) / 0.38)", marginTop: 9, fontFamily: "monospace",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Cpu size={11} color="hsl(72 95% 42%)" weight="bold" />
            03 · AI Planner · sites analyzed
          </div>
        </div>
      </div>

      {/* ── Infra chips — woven below "182", aligned to right column ── */}
      <div
        style={{
          display: "flex", gap: 8, marginTop: 16,
          paddingLeft: "44%",
          paddingRight: 0,
          flexWrap: "wrap",
        }}
      >
        {CHIPS.map(({ label, Icon, color }, i) => (
          <div
            key={label}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px",
              border: `1px solid ${color}50`,
              borderRadius: 3,
              background: `${color}0d`,
              fontSize: 11, fontFamily: "monospace", fontWeight: 600,
              color,
              opacity: visible ? 1 : 0,
              transform: visible ? "none" : "scale(0.85)",
              transition: `opacity 0.38s ease ${360 + i * 55}ms, transform 0.42s cubic-bezier(0.34,1.56,0.64,1) ${360 + i * 55}ms`,
            }}
          >
            <Icon size={12} color={color} weight="bold" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
