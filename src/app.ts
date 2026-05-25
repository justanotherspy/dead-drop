import { Hono } from "hono";
import type { Env } from "./env";
import { corsHeaders } from "./ingest/cors";
import { handleIngest } from "./ingest/handler";

export const app = new Hono<{ Bindings: Env }>();

app.options("/", (c) => new Response(null, { status: 204, headers: corsHeaders(c.env) }));
app.post("/", handleIngest);
