import { useEffect, useRef, useState } from "react";

// Tween a number toward its target (count-up) instead of snapping. Cubic ease-out.
export function useCountUp(target: number, duration = 550): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const start = previous.current;
    const delta = target - start;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(start + delta * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    previous.current = target;
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  return value;
}
