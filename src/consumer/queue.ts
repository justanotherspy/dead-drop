import type { Env } from "../env";
import type { QueuePayload } from "../lib/schema";
import { postToSlack } from "../lib/slack";
import { alreadyPosted, markPosted } from "../lib/idempotency";

// If a thrown Slack error carries a Retry-After hint, honor it; otherwise let the
// queue apply its own backoff.
function retryDelaySeconds(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const hint = record.retryAfter ?? record.retry_after;
    if (typeof hint === "number" && Number.isFinite(hint) && hint > 0) {
      return hint;
    }
  }
  return undefined;
}

// Drains the queue and posts each message to Slack. Idempotent on payload id;
// failures retry with backoff and ultimately dead-letter (design §Consumer).
// `post` is injectable for testing.
export async function handleQueueBatch(
  batch: MessageBatch<QueuePayload>,
  env: Env,
  post: (env: Env, payload: QueuePayload) => Promise<void> = postToSlack,
): Promise<void> {
  for (const message of batch.messages) {
    const payload = message.body;
    try {
      if (await alreadyPosted(env, payload.id)) {
        message.ack();
        continue;
      }
      await post(env, payload);
      await markPosted(env, payload.id);
      message.ack();
    } catch (err) {
      const delaySeconds = retryDelaySeconds(err);
      message.retry(delaySeconds !== undefined ? { delaySeconds } : undefined);
    }
  }
}
