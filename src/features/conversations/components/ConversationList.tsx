import { useParams } from "@tanstack/react-router";
import { SidebarGroup, SidebarMenu } from "@/components/ui/sidebar";
import { useConversations } from "../context";
import { selectRows } from "../model";
import { ConversationRow } from "./ConversationRow";

export function ConversationList() {
  const order = useConversations((s) => s.list?.order);
  const byId = useConversations((s) => s.list?.byId);
  const rows = order && byId ? selectRows({ order, byId }) : [];
  const { conversationId } = useParams({ strict: false });

  return (
    <nav aria-label="Conversations">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No conversations yet</p>
      ) : (
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {rows.map((row) => (
              <ConversationRow key={row.id} row={row} selected={row.id === conversationId} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </nav>
  );
}
