import type { Env } from "./env";
import type { QueuePayload } from "./lib/schema";
import { app } from "./app";
import { handleQueueBatch } from "./consumer/queue";

export { GlobalCounter } from "./do/global-counter";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<QueuePayload>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
} satisfies ExportedHandler<Env, QueuePayload>;
