import { SlackAPIClient } from "slack-edge";
import type { Env } from "../env";
import type { QueuePayload } from "./schema";
import { escapeSlackMrkdwn } from "./sanitize";

export interface FormattedMessage {
  text: string;
  blocks: Array<{ type: "section"; text: { type: "mrkdwn"; text: string } }>;
}

// Block Kit per design §Consumer. Alias is escaped; message is escaped and
// blockquoted line-by-line so multi-line content stays quoted.
export function formatMessage(payload: QueuePayload): FormattedMessage {
  const who = payload.anonymous
    ? "_anonymous_"
    : `*${escapeSlackMrkdwn(payload.alias ?? "unknown")}*`;
  const header = `:envelope_with_arrow: *new dead drop* · ${payload.ts} · ${who}`;
  const body = escapeSlackMrkdwn(payload.message)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return {
    text: `${header}\n${body}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: header } },
      { type: "section", text: { type: "mrkdwn", text: body } },
    ],
  };
}

// Posts to the private channel. Throws on failure so the queue consumer can retry
// (and ultimately dead-letter). Never reflects content back to the client.
export async function postToSlack(env: Env, payload: QueuePayload): Promise<void> {
  const client = new SlackAPIClient(env.SLACK_BOT_TOKEN);
  const { text, blocks } = formatMessage(payload);
  await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    text,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  });
}
