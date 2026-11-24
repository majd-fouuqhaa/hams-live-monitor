import { cn } from "cn";
import { STATUS_LABEL } from "../constants";
import type { Status } from "../types";

interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[0.7rem] font-medium whitespace-nowrap",
        status === "needs_human"
          ? "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300"
          : "border-border text-sidebar-foreground/70",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
