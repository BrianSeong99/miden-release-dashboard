import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { deriveComponentStatus, deriveReadiness } from "./status-engine";
import type { ComponentStatus } from "./types";

describe("release toolchain configuration", () => {
  it.each(["0.15", "0.16", "0.17"])("includes the compiler, debugger and full midenup channel for %s", (train) => {
    const release = loadConfig().release.releases.find((r) => r.targetVersion === train)!;
    const components = new Map(release.components.map((c) => [c.id, c]));
    expect(components.get("debugger")?.dependsOn).toEqual(["vm"]);
    expect(components.get("compiler")?.dependsOn).toEqual(train === "0.17" ? ["vm"] : ["vm", "protocol", "debugger"]);
    if (train !== "0.15") expect(components.get("rust-sdk")?.dependsOn).toContain("debugger");
    const toolchain = components.get("midenup")!;
    expect(toolchain.group).toBe("toolchain");
    const pins = toolchain.detectors.filter((d) => d.type === "midenup-channel");
    for (const component of ["vm", "core", "debug", "midenc", "cargo-miden", "protocol", "client", "node", "faucet-client", "remote-prover", "validator", "verify"]) {
      expect(pins.some((d) => d.component === component)).toBe(true);
    }
    expect(pins.find((d) => d.component === "debug")?.targetTrain).toBe({ "0.15": "0.8", "0.16": "0.10", "0.17": "0.15" }[train]);
  });

  it("does not invent a compiler version for v17, whose VM dependency is 0.32", () => {
    const components = loadConfig().release.releases.find((r) => r.targetVersion === "0.17")!.components;
    expect(components.find((c) => c.id === "compiler")?.expectedVersion).toBeNull();
    expect(components.find((c) => c.id === "vm")?.expectedVersion).toBe("0.32.0");
  });

  it("ignores SDK/template releases and debugger subcrate releases", () => {
    const components = loadConfig().release.releases.find((r) => r.targetVersion === "0.16")!.components;
    for (const id of ["compiler", "debugger"]) {
      const config = components.find((c) => c.id === id)!;
      expect(config).toBeDefined();
      const tags = id === "compiler"
        ? ["templates/v0.32.0", "sdk/v0.14.0", "v0.10.1"]
        : ["miden-debug-engine-v0.10.99", "miden-debug-dap-v0.20.0", "miden-debug-v0.10.3"];
      const s = deriveComponentStatus({
        config, releaseTargetVersion: "0.16", depFindings: [], blockers: [], migrationPrOpen: null,
        releases: { ok: true, checkedAt: "2026-09-10T00:00:00Z", value: tags.map((tagName) => ({
          tagName, prerelease: false, publishedAt: null, htmlUrl: `https://github.com/${config.repo}/releases/tag/${tagName}`,
        })) },
      });
      expect(s.latestStable).toBe(id === "compiler" ? "0.10.1" : "0.10.3");
      expect(s.matchedRelease).toBe(s.latestStable);
    }
  });

  it("requires a compatible midenup toolchain for readiness but accepts its independent version trains", () => {
    const component = (status: ComponentStatus["status"]): ComponentStatus => ({ group: "toolchain", status }) as ComponentStatus;
    const envs = [{ status: "current" }] as never;
    expect(deriveReadiness([component("compatible")], envs, 0).level).toBe("ready");
    expect(deriveReadiness([component("prerelease-deps")], envs, 0).level).toBe("in-progress");
  });

  it("does not mark an unconfirmed compiler release ready just because its VM pin was updated", () => {
    const config = loadConfig().release.releases.find((r) => r.targetVersion === "0.17")!.components.find((c) => c.id === "compiler")!;
    const s = deriveComponentStatus({
      config, releases: null, releaseTargetVersion: "0.17", blockers: [], migrationPrOpen: null,
      depFindings: [{ detector: { type: "cargo-dep", dependency: "miden-core", path: "Cargo.toml", targetTrain: "0.32" },
        result: { ok: true, checkedAt: "2026-09-10T00:00:00Z", value: { raw: "0.32.0", source: "VM", url: "https://github.com/0xMiden/compiler" } } }],
    });
    expect(s.status).toBe("unknown");
    expect(s.reason).toContain("not yet confirmed");
  });
});
