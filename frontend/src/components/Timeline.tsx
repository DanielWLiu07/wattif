import { Play, Pause, SkipForward, RotateCcw } from "lucide-react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAX_TICK = 60;

function TipButton({
  tip,
  ...props
}: { tip: string } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props} />
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export function Timeline() {
  const metrics = useStore((s) => s.metrics);
  const playing = useStore((s) => s.playing);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);
  const step = useStore((s) => s.step);
  const reset = useStore((s) => s.reset);
  const tick = metrics?.tick ?? 0;

  const idle = tick === 0 && !playing;

  return (
    <div className="pointer-events-auto mx-auto w-[560px] max-w-[92vw]">
      {idle && (
        <div className="mb-2 flex animate-pulse items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Play className="h-3.5 w-3.5 text-primary" />
          Press <b className="text-foreground">Play</b> to run the simulation, or{" "}
          <b className="text-foreground">Step</b> one month at a time.
        </div>
      )}
      <div className="glass flex items-center gap-3 rounded-xl px-4 py-2.5 shadow-xl">
        <TipButton
          tip={playing ? "Pause simulation" : "Play — advance month by month"}
          size="icon"
          variant={playing ? "secondary" : "default"}
          onClick={() => (playing ? pause() : play())}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </TipButton>
        <TipButton
          tip="Step forward one month"
          size="icon"
          variant="outline"
          onClick={() => step()}
          aria-label="Step forward"
        >
          <SkipForward />
        </TipButton>
        <TipButton
          tip="Reset simulation to tick 0"
          size="icon"
          variant="ghost"
          onClick={() => reset()}
          aria-label="Reset"
        >
          <RotateCcw />
        </TipButton>

        <div className="flex flex-1 flex-col gap-1">
          <Slider
            value={[Math.min(tick, MAX_TICK)]}
            max={MAX_TICK}
            step={1}
            onValueChange={() => {
              /* scrubbing is visual; sim advances via step/play */
            }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>2026</span>
            <span className="font-medium text-foreground">
              {metrics?.year ?? 2026} · month {tick}
            </span>
            <span>2031</span>
          </div>
        </div>
      </div>
    </div>
  );
}
