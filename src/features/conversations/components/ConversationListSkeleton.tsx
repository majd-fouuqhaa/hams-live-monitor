import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";

/** Fixed (not random) name widths, so the placeholder looks the same on every render. */
const NAME_WIDTHS = ["w-28", "w-36", "w-24", "w-32", "w-28", "w-20"];

/** Shown while the conversations load. Each placeholder mirrors a real row's layout and height (ADR 0006),
 *  so nothing shifts when the list arrives. */
export function ConversationListSkeleton() {
  return (
    <div role="status" aria-label="Loading conversations">
      <SidebarGroup aria-hidden>
        <SidebarMenu className="gap-1">
          {NAME_WIDTHS.map((nameWidth, i) => (
            <SidebarMenuItem key={i}>
              {/* Same box as the row's link: padding, gap, avatar, three lines. */}
              <div className="flex w-full items-start gap-3 px-3 py-2.5 text-sm">
                <Placeholder className="mt-0.5 size-7 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex h-5 items-center gap-2">
                    <Placeholder className={cn("h-3.5", nameWidth)} />
                    <Placeholder className="h-4 w-16 rounded-full" />
                    <Placeholder className="ms-auto h-3 w-6" />
                  </div>
                  <div className="flex h-[2lh] flex-col justify-center gap-2 text-xs/relaxed">
                    <Placeholder className="h-2.5 w-full" />
                    <Placeholder className="h-2.5 w-2/3" />
                  </div>
                  <div className="h-4" />
                </div>
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </div>
  );
}

interface PlaceholderProps {
  className?: string;
}

/** A skeleton shape tinted from the foreground: visible on the sidebar in light and dark mode. */
function Placeholder({ className }: PlaceholderProps) {
  return <Skeleton className={cn("rounded-sm bg-foreground/15", className)} />;
}
