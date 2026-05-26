import { Buildings, Users, Cpu, Lightning, Sun, Wind, BatteryCharging, Broadcast } from "@phosphor-icons/react";

interface FlowDiagramProps {
  visible: boolean;
}

const NODES = [
  {
    label: "City Data",
    stat: "419,582",
    unit: "buildings mapped",
    Icon: Buildings,
    iconColor: "#60a5fa",
    iconBg: "rgba(59,130,246,0.12)",
    iconBorder: "rgba(59,130,246,0.3)",
  },
  {
    label: "Simulated Agents",
    stat: "8,001",
    unit: "residents modelled",
    Icon: Users,
    iconColor: "#a78bfa",
    iconBg: "rgba(139,92,246,0.12)",
    iconBorder: "rgba(139,92,246,0.3)",
  },
  {
    label: "AI Planner",
    stat: "583",
    unit: "sites analyzed",
    Icon: Cpu,
    iconColor: "hsl(72 95% 45%)",
    iconBg: "hsl(72 95% 50% / 0.12)",
    iconBorder: "hsl(72 95% 50% / 0.4)",
  },
  {
    label: "Sited Infrastructure",
    stat: "182",
    unit: "assets placed",
    Icon: Lightning,
    iconColor: "#34d399",
    iconBg: "rgba(16,185,129,0.12)",
    iconBorder: "rgba(16,185,129,0.3)",
  },
] as const;

const CHIPS = [
  { label: "Solar",    Icon: Sun,            color: "#fbbf24" },
  { label: "Wind",     Icon: Wind,           color: "#60a5fa" },
  { label: "Battery",  Icon: BatteryCharging, color: "#34d399" },
  { label: "Microgrid",Icon: Broadcast,      color: "hsl(72 95% 50%)" },
] as const;

function Connector({ index, visible }: { index: number; visible: boolean }) {
  const delay = index * 180 + 200;
  return (
    <div
      style={{
        flex: 1,
        alignSelf: "flex-start",
        marginTop: 31, // vertically center against the 64px icon
        position: "relative",
        height: 2,
      }}
    >
      {/* Line draw-in */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "hsl(var(--foreground) / 0.1)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          background: "hsl(72 95% 50% / 0.55)",
          transformOrigin: "left",
          transform: visible ? "scaleX(1)" : "scaleX(0)",
          transition: `transform 0.5s ease ${delay}ms`,
        }}
      />
      {/* Traveling volt pulse dot */}
      <div
        style={{
          position: "absolute",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "hsl(72 95% 50%)",
          top: -2.5,
          boxShadow: "0 0 8px 3px hsl(72 95% 50% / 0.5)",
          animation: visible
            ? `pulseDot 1.8s ease-in-out ${delay + 500}ms infinite`
            : "none",
        }}
      />
    </div>
  );
}

export function FlowDiagram({ visible }: FlowDiagramProps) {
  const vis = (delay: number) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(9px)",
    transition: "opacity 0.42s ease, transform 0.42s ease",
    transitionDelay: visible ? `${delay}ms` : "0ms",
  });

  return (
    <>
      <style>{`
        @keyframes pulseDot {
          0%   { left: 5%;  opacity: 0;   }
          12%  {            opacity: 1;   }
          88%  {            opacity: 1;   }
          100% { left: 92%; opacity: 0;   }
        }
      `}</style>

      <div
        className="pointer-events-none absolute top-0 left-0 flex h-full w-full flex-col items-center justify-center px-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.97)",
          filter: visible ? "blur(0px)" : "blur(3px)",
          transition: "opacity 0.55s ease, transform 0.55s ease, filter 0.55s ease",
          willChange: "opacity, transform, filter",
        }}
      >
        {/* Header */}
        <div className="mb-12 flex flex-col items-center gap-3" style={vis(0)}>
          <span className="label" style={{ color: "hsl(var(--brand))" }}>
            How WattIf Works
          </span>
          <h2
            className="font-display font-bold leading-tight text-foreground text-center"
            style={{ fontSize: "clamp(2rem, 3vw, 2.75rem)", letterSpacing: "-0.02em" }}
          >
            An AI that sites the grid —{" "}
            <span style={{ color: "hsl(var(--brand))" }}>live.</span>
          </h2>
        </div>

        {/* Flow row */}
        <div
          className="flex w-full items-start"
          style={{ maxWidth: 960, ...vis(80) }}
        >
          {NODES.map((node, i) => (
            <div key={node.label} className="flex items-start" style={{ flex: 1 }}>
              {/* Node */}
              <div
                className="flex flex-col items-center gap-3"
                style={{ flex: "0 0 auto", width: 140 }}
              >
                {/* Icon circle */}
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: node.iconBg,
                    border: `1.5px solid ${node.iconBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: visible ? 1 : 0,
                    transform: visible ? "scale(1)" : "scale(0.8)",
                    transition: `opacity 0.4s ease ${i * 180 + 100}ms, transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 180 + 100}ms`,
                  }}
                >
                  <node.Icon size={28} color={node.iconColor} weight="duotone" />
                </div>

                {/* Text */}
                <div
                  className="flex flex-col items-center gap-1 text-center"
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? "translateY(0)" : "translateY(5px)",
                    transition: `opacity 0.4s ease ${i * 180 + 220}ms, transform 0.4s ease ${i * 180 + 220}ms`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "hsl(var(--foreground) / 0.45)",
                    }}
                  >
                    {node.label}
                  </span>
                  <span
                    className="font-mono font-semibold text-foreground"
                    style={{ fontSize: "1.75rem", lineHeight: 1 }}
                  >
                    {node.stat}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--foreground) / 0.45)",
                    }}
                  >
                    {node.unit}
                  </span>
                </div>

                {/* Chips — only on last node */}
                {i === NODES.length - 1 && (
                  <div
                    className="mt-3 flex flex-wrap justify-center gap-2"
                    style={{
                      opacity: visible ? 1 : 0,
                      transition: `opacity 0.4s ease ${i * 180 + 480}ms`,
                    }}
                  >
                    {CHIPS.map(({ label, Icon, color }) => (
                      <div
                        key={label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: `1px solid ${color}55`,
                          background: `${color}12`,
                          fontSize: 11,
                          fontFamily: "monospace",
                          color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Icon size={12} weight="bold" color={color} />
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Connector — after every node except the last */}
              {i < NODES.length - 1 && <Connector index={i} visible={visible} />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
