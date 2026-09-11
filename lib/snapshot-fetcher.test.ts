import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSnapshot } from "./snapshot-fetcher";

afterEach(() => vi.unstubAllGlobals());

describe("fetchSnapshot", () => {
  it("bypasses cached snapshot files when checking for a newer deployment", async () => {
    const latest = { generatedAt: "2026-09-11T06:12:12Z" };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => latest });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchSnapshot("data/0.16.json")).toEqual(latest);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^data\/0\.16\.json\?refresh=\d+$/), { cache: "no-store" });
  });

  it("rejects HTTP failures so they cannot replace the last good snapshot", async () => {
    const json = vi.fn().mockResolvedValue({ message: "Unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json }));
    await expect(fetchSnapshot("data/0.16.json")).rejects.toThrow("503");
    expect(json).not.toHaveBeenCalled();
  });
});
