import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store";
import type { ScenarioType } from "@/types";

// Per-event radial tint for the screen-flash drama moment.
const FLASH: Record<string, string> = {
  earthquake:
    "radial-gradient(circle at 50% 50%, rgba(180,83,9,0.0) 30%, rgba(120,53,15,0.9) 100%)",
  blackout:
    "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.0) 20%, rgba(2,4,10,0.98) 95%)",
  heatwave:
    "radial-gradient(circle at 50% 30%, rgba(249,115,22,0.5) 0%, rgba(127,29,29,0.0) 70%)",
  gas_spike:
    "radial-gradient(circle at 50% 50%, rgba(239,68,68,0.4) 0%, rgba(80,10,10,0.0) 70%)",
  ice_storm:
    "radial-gradient(circle at 50% 40%, rgba(56,189,248,0.45) 0%, rgba(8,47,73,0.0) 70%)",
  population_boom:
    "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.4) 0%, rgba(46,16,101,0.0) 70%)",
  policy_incentive:
    "radial-gradient(circle at 50% 50%, rgba(52,211,153,0.4) 0%, rgba(6,78,59,0.0) 70%)",
  default:
    "radial-gradient(circle at 50% 50%, rgba(250,204,21,0.35) 0%, rgba(120,90,10,0.0) 70%)",
};

export function ScenarioFlash() {
  const scenarios = useStore((s) => s.scenarios);
  const last = scenarios[scenarios.length - 1];
  const seen = useRef<string | null>(null);
  const [flash, setFlash] = useState<{ key: number; bg: string } | null>(null);

  useEffect(() => {
    if (!last || last.id === seen.current) return;
    seen.current = last.id;
    setFlash({
      key: Date.now(),
      bg: FLASH[last.type as ScenarioType] ?? FLASH.default,
    });
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [last]);

  if (!flash) return null;
  return (
    <div
      key={flash.key}
      className="scenario-flash pointer-events-none absolute inset-0 z-[55]"
      style={{ background: flash.bg }}
    />
  );
}
