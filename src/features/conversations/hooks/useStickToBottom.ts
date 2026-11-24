import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { THREAD_FOLLOW_THRESHOLD_PX } from "../constants";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface StickToBottomOptions {
  scrollRef: React.RefObject<HTMLElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** All rows, pending replies included. */
  rowCount: number;
  /** Pending replies: a new one means the user just sent, which always scrolls down. */
  pendingCount: number;
}

export function useStickToBottom({
  scrollRef,
  virtualizer,
  rowCount,
  pendingCount,
}: StickToBottomOptions) {
  // Pinned: the view follows new content. Starts pinned, so the thread opens at the newest message.
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth && !reducedMotion() ? "smooth" : "auto",
      });
    },
    [scrollRef],
  );

  const totalSize = virtualizer.getTotalSize();
  const lastRowCount = useRef(rowCount);

  useLayoutEffect(() => {
    const rows = lastRowCount.current;
    if (rows > 0) virtualizer.scrollToIndex(rows - 1, { align: "end" });
  }, [virtualizer]);

  // New rows, or a streaming reply growing: follow if pinned, otherwise offer the jump button.
  useEffect(() => {
    const added = rowCount > lastRowCount.current;
    lastRowCount.current = rowCount;
    if (pinned.current) scrollToBottom(true);
    else if (added) setShowJump(true);
  }, [totalSize, rowCount, scrollToBottom]);

  // Your own send always brings you down to it.
  const lastPendingCount = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > lastPendingCount.current) {
      pinned.current = true;
      setShowJump(false);
      scrollToBottom(true);
    }
    lastPendingCount.current = pendingCount;
  }, [pendingCount, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight <= THREAD_FOLLOW_THRESHOLD_PX;
    if (pinned.current) setShowJump(false);
  };

  const jump = () => {
    pinned.current = true;
    setShowJump(false);
    const el = scrollRef.current;
    // Far away (e.g. high up in c-1), animating would pass thousands of unmeasured rows: jump instead.
    const far = el ? el.scrollHeight - el.scrollTop > el.clientHeight * 3 : true;
    if (far) virtualizer.scrollToIndex(rowCount - 1, { align: "end" });
    else scrollToBottom(true);
  };

  return { showJump, onScroll, jump };
}
