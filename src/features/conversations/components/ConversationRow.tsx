import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { memo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { formatLong, formatShort, useNow } from "@/utils/relative-time";
import { STATUS_LABEL, UNREAD_DISPLAY_MAX } from "../constants";
import type { RowView } from "../types";
import { ArrivalFlash } from "./ArrivalFlash";
import { StatusBadge } from "./StatusBadge";
import { TypingDots } from "./TypingDots";

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function accessibleName(row: RowView, when: string) {
  return [
    row.customer,
    STATUS_LABEL[row.status],
    row.unread > 0 ? `${row.unread} unread` : null,
    row.typing ? "AI is replying" : null,
    `${when}: ${row.lastMessage}`,
  ]
    .filter(Boolean)
    .join(", ");
}

interface ConversationRowProps {
  row: RowView;
  /** This row's conversation is the one on screen. */
  selected: boolean;
}

export const ConversationRow = memo(function ConversationRow({
  row,
  selected,
}: ConversationRowProps) {
  const now = useNow();

  return (
    <SidebarMenuItem>
      {row.handedOffAt && <ArrivalFlash key={row.handedOffAt} at={row.handedOffAt} />}
      <SidebarMenuButton
        size="lg"
        isActive={selected}
        className={cn(
          "relative h-auto items-start gap-3 px-3 py-2.5",
          "hover:bg-foreground/5 data-active:bg-foreground/9 data-active:font-normal data-active:hover:bg-foreground/9",
          "before:absolute before:inset-y-2.5 before:inset-s-0 before:w-1 before:rounded-full data-active:before:bg-sidebar-foreground",
        )}
        render={
          <Link
            to="/conversations/$conversationId"
            params={{ conversationId: row.id }}
            aria-label={accessibleName(row, formatLong(row.updatedAt, now))}
            aria-current={selected ? "page" : undefined}
          />
        }
      >
        <div aria-hidden className="contents">
          <Avatar className="mt-0.5 size-7">
            <AvatarFallback className="text-[0.65rem] font-semibold text-sidebar-foreground/70">
              {initials(row.customer)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate text-start font-medium">
                <bdi>{row.customer}</bdi>
              </span>
              <StatusBadge status={row.status} />
              <time
                dateTime={row.updatedAt}
                className="ms-auto shrink-0 text-xs tabular-nums text-sidebar-foreground/70"
              >
                {formatShort(row.updatedAt, now)}
              </time>
            </div>
            <div className="flex items-start gap-2">
              <p className="line-clamp-2 h-[2lh] min-w-0 flex-1 text-start text-xs/relaxed text-sidebar-foreground/70">
                <bdi>{row.lastMessage}</bdi>
              </p>
              <span className="mt-0.5 flex w-8 shrink-0 justify-end">
                {row.unread > 0 && (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-foreground px-1.5 text-[0.7rem] font-semibold text-background tabular-nums">
                    {row.unread > UNREAD_DISPLAY_MAX ? `${UNREAD_DISPLAY_MAX}+` : row.unread}
                  </span>
                )}
              </span>
            </div>
            <div className="flex h-4 items-center gap-1.5 text-xs text-sidebar-foreground/70">
              {row.typing && (
                <>
                  <TypingDots />
                  <span>AI is replying</span>
                </>
              )}
            </div>
          </div>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
