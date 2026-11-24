import { useEffect, useState } from "react";
import { useConversationsStore } from "../context";

export function HandoffAnnouncer() {
  const store = useConversationsStore();
  const [message, setMessage] = useState("");

  useEffect(
    () =>
      store.subscribe(({ list }, previous) => {
        if (!list || list.byId === previous.list?.byId) return;
        for (const id of list.order) {
          const row = list.byId[id];
          if (row?.handedOffAt && row.handedOffAt !== previous.list?.byId[id]?.handedOffAt) {
            setMessage(`${row.customer} needs a human`);
          }
        }
      }),
    [store],
  );

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
