import { describe, expect, it } from "vitest";
import { formatMessage } from "../src/lib/slack";
import type { QueuePayload } from "../src/lib/schema";

const base: QueuePayload = {
  id: "id-1",
  ts: "2026-05-25T14:02:00.000Z",
  message: "hello there",
  anonymous: true,
};

describe("formatMessage", () => {
  it("labels anonymous submissions", () => {
    const { text, blocks } = formatMessage(base);
    expect(text).toContain("_anonymous_");
    expect(text).toContain(base.ts);
    expect(text).toContain("> hello there");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.text.type).toBe("mrkdwn");
  });

  it("shows the escaped alias when not anonymous", () => {
    const { text } = formatMessage({ ...base, anonymous: false, alias: "Agent <X>" });
    expect(text).toContain("*Agent &lt;X&gt;*");
    expect(text).not.toContain("_anonymous_");
  });

  it("escapes Slack control characters in the body", () => {
    const { text } = formatMessage({ ...base, message: "a & b <c> @here" });
    expect(text).toContain("> a &amp; b &lt;c&gt; @here");
  });

  it("blockquotes every line of a multi-line message", () => {
    const { text } = formatMessage({ ...base, message: "line1\nline2" });
    expect(text).toContain("> line1\n> line2");
  });
});
