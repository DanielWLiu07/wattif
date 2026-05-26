import {
  Play,
  CursorClick as MousePointerClick,
  Sparkle as Sparkles,
  Scales as Scale,
  CellSignalFull as Activity,
  ArrowRight,
} from "@phosphor-icons/react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";

const FEATURES = [
  {
    icon: Scale,
    label: "Equity overlays",
    desc: "See who carries the energy burden.",
  },
  {
    icon: Sparkles,
    label: "AI site planner",
    desc: "Let an agent propose sitings.",
  },
  {
    icon: Activity,
    label: "Live scenarios",
    desc: "Coverage, cost & approval in 3D.",
  },
] as const;

export function Welcome() {
  const showWelcome = useStore((s) => s.showWelcome);
  const dismissWelcome = useStore((s) => s.dismissWelcome);
  const runGuidedDemo = useStore((s) => s.runGuidedDemo);
  if (!showWelcome) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-foreground/30 animate-in fade-in duration-200">
      <div className="animate-in fade-in zoom-in-95 mx-4 w-full max-w-md overflow-hidden rounded-[var(--radius)] border border-border bg-card duration-200">
        {/* Header — brand lockup over a hairline rule */}
        <div className="flex flex-col items-start gap-5 border-b border-border px-7 pb-6 pt-7">
          <Logo size="lg" />
          <div className="space-y-1.5">
            <p className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">
              Toronto's energy future,
              <br />
              one scenario at a time.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Plan renewable infrastructure across the city and watch coverage,
              cost, public approval, and{" "}
              <span className="font-semibold text-foreground">
                energy equity
              </span>{" "}
              play out in 3D — by hand or with an AI planning agent.
            </p>
          </div>
        </div>

        {/* Feature list — aligned volt-tinted icon tiles + descriptor */}
        <ul className="divide-y divide-border">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <li key={label} className="flex items-center gap-3.5 px-7 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-brand/10 text-brand">
                <Icon className="h-[18px] w-[18px]" weight="regular" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight text-foreground">
                  {label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {desc}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 border-t border-border px-7 pb-6 pt-5">
          <Button
            className="group w-full justify-center hover:bg-brand hover:text-brand-ink"
            onClick={() => void runGuidedDemo()}
          >
            <Play weight="fill" />
            Run guided demo
            <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={dismissWelcome}
          >
            <MousePointerClick />
            Explore on my own
          </Button>
          <p className="pt-1 text-center font-mono text-[11px] leading-relaxed text-muted-foreground">
            Runs fully on built-in data — no backend or API key required.
          </p>
        </div>
      </div>
    </div>
  );
}
