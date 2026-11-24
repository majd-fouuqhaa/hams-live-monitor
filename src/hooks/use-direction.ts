// The layout direction (RTL / LTR), chosen by the user and kept between visits.
// It lives on <html dir>, so every logical utility (ms-, ps-, start-, text-start…) mirrors at once.
import { useSyncExternalStore } from "react";

export type Direction = "ltr" | "rtl";

const STORAGE_KEY = "hams.direction";
const listeners = new Set<() => void>();

function read(): Direction {
  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
}

/** Applies the saved direction. Call once before the first render, so the page never flips after load. */
export function applySavedDirection() {
  document.documentElement.dir = localStorage.getItem(STORAGE_KEY) === "rtl" ? "rtl" : "ltr";
}

export function setDirection(direction: Direction) {
  document.documentElement.dir = direction;
  localStorage.setItem(STORAGE_KEY, direction);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDirection(): Direction {
  return useSyncExternalStore(subscribe, read);
}
