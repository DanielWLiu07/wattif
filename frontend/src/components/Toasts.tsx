import {
  CheckCircle as CheckCircle2,
  Warning as AlertTriangle,
  Info,
  Lightning as Zap,
  X,
} from "@phosphor-icons/react";
import { useStore } from "@/store";

const ICON = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: Zap,
  info: Info,
} as const;
const TINT = {
  good: "border-primary/40 text-primary",
  warn: "border-yellow-500/40 text-yellow-700",
  bad: "border-red-400/40 text-red-600",
  info: "border-border text-foreground",
} as const;

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            className={`glass animate-in fade-in slide-in-from-top-2 pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium duration-300 ${TINT[t.kind]}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[320px] text-foreground/90">{t.text}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="ml-1 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
