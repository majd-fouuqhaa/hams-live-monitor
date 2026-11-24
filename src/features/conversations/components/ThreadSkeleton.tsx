import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { THREAD_SKELETON_ROWS } from "../constants";

export function ThreadSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading messages"
      className="flex flex-1 flex-col justify-end gap-3 p-4"
    >
      {Array.from({ length: THREAD_SKELETON_ROWS }, (_, i) => (
        <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
          <Skeleton className={cn("h-12 rounded-2xl", i % 3 ? "w-1/2" : "w-2/5")} />
        </div>
      ))}
    </div>
  );
}
