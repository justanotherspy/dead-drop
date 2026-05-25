import { describe, expect, it } from "vitest";
import { MAX_ALIAS_CHARS, MAX_MESSAGE_CHARS, validateSubmission } from "../src/lib/schema";

describe("validateSubmission", () => {
  it("accepts a minimal anonymous message", () => {
    const r = validateSubmission({ message: "hello" });
    expect(r).toEqual({ kind: "ok", submission: { message: "hello", anonymous: true } });
  });

  it("defaults anonymous to true when missing or non-boolean", () => {
    expect(validateSubmission({ message: "x", anonymous: "yes" })).toMatchObject({
      kind: "ok",
      submission: { anonymous: true },
    });
  });

  it("trims the message", () => {
    expect(validateSubmission({ message: "  hi  " })).toMatchObject({
      submission: { message: "hi" },
    });
  });

  it("rejects a non-object body", () => {
    expect(validateSubmission(null)).toEqual({
      kind: "error",
      status: 400,
      error: "invalid_request",
    });
    expect(validateSubmission([1, 2])).toMatchObject({ kind: "error", status: 400 });
  });

  it("rejects a missing or non-string message", () => {
    expect(validateSubmission({})).toMatchObject({ kind: "error", status: 400 });
    expect(validateSubmission({ message: 123 })).toMatchObject({ kind: "error", status: 400 });
  });

  it("rejects an empty / whitespace-only message", () => {
    expect(validateSubmission({ message: "   " })).toMatchObject({ kind: "error", status: 400 });
  });

  it("rejects an over-cap message with 413", () => {
    const r = validateSubmission({ message: "a".repeat(MAX_MESSAGE_CHARS + 1) });
    expect(r).toEqual({ kind: "error", status: 413, error: "too_large" });
  });

  it("flags a non-empty honeypot regardless of message", () => {
    expect(validateSubmission({ message: "hi", company: "Acme" })).toEqual({ kind: "honeypot" });
    expect(validateSubmission({ message: "", company: "bot" })).toEqual({ kind: "honeypot" });
  });

  it("ignores an empty honeypot", () => {
    expect(validateSubmission({ message: "hi", company: "  " })).toMatchObject({ kind: "ok" });
  });

  it("keeps a valid alias when not anonymous", () => {
    expect(validateSubmission({ message: "hi", anonymous: false, alias: "  Spy  " })).toMatchObject(
      { submission: { anonymous: false, alias: "Spy" } },
    );
  });

  it("ignores alias entirely when anonymous", () => {
    const r = validateSubmission({ message: "hi", anonymous: true, alias: "Spy" });
    expect(r).toEqual({ kind: "ok", submission: { message: "hi", anonymous: true } });
  });

  it("rejects an over-cap alias with 400", () => {
    expect(
      validateSubmission({
        message: "hi",
        anonymous: false,
        alias: "a".repeat(MAX_ALIAS_CHARS + 1),
      }),
    ).toMatchObject({ kind: "error", status: 400 });
  });

  it("rejects a non-string alias when not anonymous", () => {
    expect(validateSubmission({ message: "hi", anonymous: false, alias: 42 })).toMatchObject({
      kind: "error",
      status: 400,
    });
  });
});
