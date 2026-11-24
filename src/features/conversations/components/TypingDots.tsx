import { TYPING_DOT_DELAYS_MS } from "../constants";

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {TYPING_DOT_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className="size-1 rounded-full bg-current motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
