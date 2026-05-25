import type { Env } from "../env";

// Locked to the site origin (design §CORS) — never "*". ALLOWED_ORIGIN is the
// browser origin, distinct from the API's own hostname.
export function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
