import { afterAll, afterEach, beforeAll } from "vite-plus/test";
import { worker } from "./msw/worker";

// Any request without a handler fails the test instead of silently reaching the real mock on :4000.
beforeAll(() => worker.start({ quiet: true, onUnhandledRequest: "error" }));
afterEach(() => worker.resetHandlers());
afterAll(() => worker.stop());
