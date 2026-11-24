import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:4000"),
});

export interface AppConfig {
  apiUrl: string;
}

/** Validates the env once at startup so a bad VITE_API_URL fails loudly instead of showing an empty list. */
export function parseConfig(env: Record<string, unknown>): AppConfig {
  const { VITE_API_URL } = EnvSchema.parse(env);
  return { apiUrl: VITE_API_URL.replace(/\/+$/, "") };
}

export const config: AppConfig = parseConfig(import.meta.env);
