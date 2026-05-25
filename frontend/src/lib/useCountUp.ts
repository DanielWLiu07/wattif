// Count-up tween is currently disabled — returns the target directly.
// (Kept as a hook seam so the animation can be re-enabled without churn.)
export function useCountUp(target: number): number {
  return target;
}
