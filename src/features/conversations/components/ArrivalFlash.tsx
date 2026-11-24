import { useState } from "react";
import { HANDOFF_FLASH_WINDOW_MS } from "../constants";

interface ArrivalFlashProps {
  /** When the hand-off was stamped (ISO time). */
  at: string;
}

export function ArrivalFlash({ at }: ArrivalFlashProps) {
  const [mountedAt] = useState(() => Date.now());
  if (mountedAt - Date.parse(at) > HANDOFF_FLASH_WINDOW_MS) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-md motion-safe:animate-arrive"
    />
  );
}
