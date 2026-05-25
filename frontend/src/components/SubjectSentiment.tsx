import { useStore } from "@/store";

// "X% support this <turbine/microgrid/rebate> here" — sentiment toward the
// specific selected/placed subject (or an active program), not the global %.
export function SubjectSentiment() {
  const subj = useStore((s) => s.subjectApproval);
  if (!subj) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
      <div className="mb-1 text-[11px]">
        <b className="text-primary tabular-nums">{subj.support}%</b> support{" "}
        <b className="capitalize">{subj.label}</b> here
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${subj.support}%` }} />
        <div className="bg-slate-500" style={{ width: `${subj.neutral}%` }} />
        <div className="bg-red-500" style={{ width: `${subj.oppose}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span className="text-emerald-400">{subj.support}% support</span>
        <span>{subj.neutral}% neutral</span>
        <span className="text-red-400">{subj.oppose}% oppose</span>
      </div>
    </div>
  );
}
