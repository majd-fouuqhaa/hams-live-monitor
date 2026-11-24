import type { RequestHandler } from "msw";

/** Default REST and SSE handlers. Tests override them per case with `worker.use(...)`. */
export const handlers: RequestHandler[] = [];
