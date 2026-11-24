import { Button } from "@/components/ui/button";
import { setDirection, useDirection } from "@/hooks/use-direction";

/** Switches the whole layout between LTR and RTL. */
export function DirectionToggle() {
  const direction = useDirection();
  const next = direction === "rtl" ? "ltr" : "rtl";
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => setDirection(next)}
      aria-label={`Switch layout to ${next.toUpperCase()}`}
    >
      {next.toUpperCase()}
    </Button>
  );
}
