import { describe, expect, it } from "vitest";
import { escapeSlackMrkdwn, sanitizeText } from "../src/lib/sanitize";

const ZWSP = "\u200B";

describe("sanitizeText", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("keeps newlines and tabs", () => {
    expect(sanitizeText("a\nb\tc")).toBe("a\nb\tc");
  });

  it("strips C0 control characters but keeps surrounding text", () => {
    expect(sanitizeText("a\u0001b\u0007c")).toBe("abc");
  });

  it("strips C1 control characters", () => {
    expect(sanitizeText("x\u0085y\u009Fz")).toBe("xyz");
  });

  it("NFC-normalizes equivalent sequences", () => {
    const decomposed = "e\u0301"; // e + combining acute accent
    const composed = "\u00E9"; // \u00E9
    expect(sanitizeText(decomposed)).toBe(composed);
  });
});

describe("escapeSlackMrkdwn", () => {
  it("escapes &, <, >", () => {
    expect(escapeSlackMrkdwn("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("neutralizes a leading mention/command sigil with a zero-width space", () => {
    expect(escapeSlackMrkdwn("@channel hi")).toBe(`${ZWSP}@channel hi`);
    expect(escapeSlackMrkdwn("#general")).toBe(`${ZWSP}#general`);
    expect(escapeSlackMrkdwn("!here")).toBe(`${ZWSP}!here`);
  });

  it("leaves a non-leading sigil alone", () => {
    expect(escapeSlackMrkdwn("hi @channel")).toBe("hi @channel");
  });

  it("escaping prevents forming a Slack mention link", () => {
    // The escaped string no longer starts with a sigil, so no zero-width space is
    // added — but <!channel> is now inert literal text, which is the point.
    expect(escapeSlackMrkdwn("<!channel>")).toBe("&lt;!channel&gt;");
  });
});
