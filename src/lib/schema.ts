// Request validation for the ingest endpoint. The client is untrusted: re-validate
// field types and lengths here regardless of what the form claims to send.

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_ALIAS_CHARS = 80;
// Generous raw-body ceiling so we reject obvious abuse before parsing/validating.
export const MAX_BODY_BYTES = 16 * 1024;

// Accepted, pre-sanitization submission.
export interface Submission {
  message: string;
  anonymous: boolean;
  alias?: string;
}

// Minimal, already-sanitized payload placed on the queue (design §Queue).
// Deliberately contains no sender IP or request metadata.
export interface QueuePayload {
  id: string;
  ts: string;
  message: string;
  anonymous: boolean;
  alias?: string;
}

export type ValidationError = "invalid_request" | "too_large";

export type ValidationResult =
  | { kind: "ok"; submission: Submission }
  | { kind: "honeypot" }
  | { kind: "error"; status: 400 | 413; error: ValidationError };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Validates an already-parsed JSON value. Byte-size and JSON-parse checks happen
// in the handler before this is called.
export function validateSubmission(body: unknown): ValidationResult {
  if (!isPlainObject(body)) {
    return { kind: "error", status: 400, error: "invalid_request" };
  }

  // Honeypot: humans never fill `company`. A non-empty value is almost certainly a bot.
  // Drop silently (handled by the caller returning 202) — no signal to the bot.
  if (typeof body.company === "string" && body.company.trim().length > 0) {
    return { kind: "honeypot" };
  }

  // message — required string, 1–2000 chars after trim.
  if (typeof body.message !== "string") {
    return { kind: "error", status: 400, error: "invalid_request" };
  }
  const message = body.message.trim();
  if (message.length === 0) {
    return { kind: "error", status: 400, error: "invalid_request" };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { kind: "error", status: 413, error: "too_large" };
  }

  // anonymous — default true if missing or not a boolean.
  const anonymous = typeof body.anonymous === "boolean" ? body.anonymous : true;

  // alias — optional display name; ignored entirely when anonymous.
  if (anonymous) {
    return { kind: "ok", submission: { message, anonymous: true } };
  }

  let alias: string | undefined;
  if (body.alias !== undefined && body.alias !== null) {
    if (typeof body.alias !== "string") {
      return { kind: "error", status: 400, error: "invalid_request" };
    }
    const trimmed = body.alias.trim();
    if (trimmed.length > MAX_ALIAS_CHARS) {
      return { kind: "error", status: 400, error: "invalid_request" };
    }
    if (trimmed.length > 0) {
      alias = trimmed;
    }
  }

  return { kind: "ok", submission: { message, anonymous: false, alias } };
}
