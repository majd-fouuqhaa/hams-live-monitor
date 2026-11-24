import { Outlet } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ConnectionBanner } from "@/features/conversations/components/ConnectionBanner";
import { ConnectionIndicator } from "@/features/conversations/components/ConnectionIndicator";
import { ConversationList } from "@/features/conversations/components/ConversationList";
import { ConversationListSkeleton } from "@/features/conversations/components/ConversationListSkeleton";
import { HandoffAnnouncer } from "@/features/conversations/components/HandoffAnnouncer";
import { useConversationsSnapshot } from "@/features/conversations/hooks/useConversationsSnapshot";

/** The list sits on the inline-start side: left in LTR, right under dir="rtl" (ADR 0005). */
function sidebarSide() {
  return document.documentElement.dir === "rtl" ? "right" : "left";
}

interface FrameProps {
  /** Sidebar body: the conversations list, or its loading skeleton. */
  list: React.ReactNode;
  /** Right side of the sidebar header. */
  status?: React.ReactNode;
  /** Sidebar footer, e.g. the connection banner. */
  banner?: React.ReactNode;
  /** The thread pane. */
  children: React.ReactNode;
}

function Frame({ list, status, banner, children }: FrameProps) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "22rem" } as React.CSSProperties}>
      <Sidebar side={sidebarSide()} variant="inset">
        <SidebarHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <h1 className="text-base font-semibold">Inbox</h1>
          {status}
        </SidebarHeader>
        <SidebarContent>{list}</SidebarContent>
        {/* At the bottom, so appearing never pushes the rows down. */}
        {banner && <SidebarFooter className="p-0 empty:hidden">{banner}</SidebarFooter>}
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">Inbox</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

export function Shell() {
  const snapshot = useConversationsSnapshot();

  if (snapshot.isError) {
    return <ShellError error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  return (
    <Frame
      list={snapshot.isPending ? <ConversationListSkeleton /> : <ConversationList />}
      status={<ConnectionIndicator />}
      banner={<ConnectionBanner />}
    >
      <HandoffAnnouncer />
      <Outlet />
    </Frame>
  );
}

interface ShellErrorProps {
  error: Error;
  onRetry: () => void;
}

function ShellError({ error, onRetry }: ShellErrorProps) {
  return (
    <div role="alert" className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold">Couldn't load conversations</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </div>
  );
}
