import { Sparkle as Sparkles, X } from "@phosphor-icons/react";
import { useStore } from "@/store";

export function DemoCaption() {
  const demo = useStore((s) => s.demo);
  const stopDemo = useStore((s) => s.stopDemo);
  if (!demo.running) return null;

  return (
    <div className="pointer-events-auto absolute bottom-32 left-1/2 z-40 w-[560px] max-w-[90vw] -translate-x-1/2">
      <div className="glass animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 rounded-xl px-4 py-3 duration-300">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-accent">
              Guided demo · {demo.step}/{demo.total}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: demo.total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-5 rounded-full transition-colors ${
                    i < demo.step ? "bg-accent" : "bg-secondary"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-sm leading-snug">{demo.caption}</p>
        </div>
        <button
          onClick={stopDemo}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="End demo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
