import { describe, expect, it } from "vitest";
import type { PropagationTiming } from "./types";
import { timingCsv } from "./timing-csv";

describe("timingCsv", () => {
  it("preserves signed numeric gaps and escapes untrusted spreadsheet labels", () => {
    const edge: PropagationTiming = { fromId: "a", toId: "b", fromLabel: '=HYPERLINK("https://example.com")', toLabel: "SDK, Web", upstream: null, downstream: null,
      state: "downstream-first", elapsedMs: -3_600_000 };
    const csv = timingCsv([], [edge], "0.16", "2026-09-11T00:00:00Z", "dependencies");
    expect(csv).toContain('"-1"');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"SDK, Web"');
  });

  it("does not fabricate zero hours for unavailable measurements", () => {
    const edge: PropagationTiming = { fromId: "a", toId: "b", fromLabel: "A", toLabel: "B", upstream: null, downstream: null, state: "unknown", elapsedMs: null };
    const row = timingCsv([], [edge], "0.16", "2026-09-11T00:00:00Z", "dependencies").split("\r\n")[1];
    expect(row).toContain('"unknown","",""');
  });
});
