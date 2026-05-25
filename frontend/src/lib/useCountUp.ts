import { useEffect, useRef, useState } from "react";

// Tween a number toward its target (count-up) instead of snapping. Cubic ease-out.
export function useCountUp(target: number, duration = 550): number {
  const [val, setVal] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    const from = ref.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * (1 - (1 - t) ** 3);
      ref.current = v;
      setVal(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        ref.current = to;
        setVal(to);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}
