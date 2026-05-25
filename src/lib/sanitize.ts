// Treat every field as hostile. Messages are plain text end-to-end and are never
// rendered as HTML, never reflected back to the client.

// C0/C1 control characters except newline (U+000A) and tab (U+0009).
const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]",
  "g",
);

// Zero-width space used to neutralize a leading Slack mention/command sigil.
const ZERO_WIDTH_SPACE = "\u200B";

// Trim, drop control characters (keeping newline/tab), then Unicode NFC normalize.
export function sanitizeText(input: string): string {
  return input.trim().replace(CONTROL_CHARS, "").normalize("NFC");
}

// Escape Slack mrkdwn control sequences so user content can't trigger formatting,
// mentions, or channel pings. Slack requires escaping &, <, > only; we also
// neutralize a leading @/#/! sigil with a zero-width space as defense-in-depth
// (design §Sanitization).
export function escapeSlackMrkdwn(input: string): string {
  const escaped = input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return /^[@#!]/.test(escaped) ? ZERO_WIDTH_SPACE + escaped : escaped;
}
