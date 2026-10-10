// The Hive priority scale: P5 ember (urgent), P4 honey, P3 chip, P1-2
// outlined. Ember and honey are reserved -- honey for "CeeBee/primary",
// ember only for urgent and overdue.
export default function PriorityPill({ priority }: { priority: number }) {
  const cls =
    priority >= 5
      ? "bg-ember text-ground"
      : priority === 4
        ? "bg-honey text-ground"
        : priority === 3
          ? "bg-chip text-cream"
          : "border border-outline text-muted";
  return (
    <span className={`shrink-0 px-2.5 py-[3px] rounded-full text-[11px] font-bold ${cls}`} title={`Priority ${priority}`}>
      P{priority}
    </span>
  );
}
