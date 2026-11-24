import { STATUS_LABEL } from "./constants";
import type { RowView } from "./types";

export function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function accessibleName(row: RowView, when: string) {
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
