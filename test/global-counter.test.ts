import { describe, expect, it } from "vitest";
import { evaluateIncrement, type Window } from "../src/do/global-counter";

const HOUR = 3600;
const now = 100_000; // arbitrary point inside some hour bucket
const bucket = Math.floor(now / HOUR);

describe("evaluateIncrement", () => {
  it("starts from zero with no stored window", () => {
    const { result, next } = evaluateIncrement(undefined, 2, now);
    expect(result.allowed).toBe(true);
    expect(next).toEqual({ bucket, count: 1 });
  });

  it("increments within the same bucket", () => {
    const stored: Window = { bucket, count: 1 };
    const { result, next } = evaluateIncrement(stored, 2, now);
    expect(result.allowed).toBe(true);
    expect(next).toEqual({ bucket, count: 2 });
  });

  it("blocks once the ceiling is reached, with no state change", () => {
    const stored: Window = { bucket, count: 2 };
    const { result, next } = evaluateIncrement(stored, 2, now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(HOUR);
    expect(next).toBeUndefined();
  });

  it("resets the count when the hour bucket rolls over", () => {
    const stored: Window = { bucket: bucket - 1, count: 999 };
    const { result, next } = evaluateIncrement(stored, 2, now);
    expect(result.allowed).toBe(true);
    expect(next).toEqual({ bucket, count: 1 });
  });

  it("reports retryAfter as seconds until the next hour", () => {
    const atTopOfHour = bucket * HOUR;
    const { result } = evaluateIncrement({ bucket, count: 5 }, 1, atTopOfHour);
    expect(result.retryAfter).toBe(HOUR);
  });
});
