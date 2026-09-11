import { describe, expect, it } from "vitest";
import { formatElapsed } from "./time-format";

describe("formatElapsed", () => {
  it.each([
    [0, "<1m"], [59_999, "<1m"], [60_000, "1m"], [3_599_999, "59m"],
    [3_600_000, "1h 0m"], [5_460_000, "1h 31m"], [86_399_999, "23h 59m"],
    [86_400_000, "1d 0h"], [183_600_000, "2d 3h"],
    [-1, "<1m"], [-5_460_000, "1h 31m"],
  ])("formats %s milliseconds without rounding up", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it.each([null, NaN, Infinity, -Infinity])("keeps unavailable duration %s unknown", (ms) => {
    expect(formatElapsed(ms)).toBe("Unknown");
  });
});
