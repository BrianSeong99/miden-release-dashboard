import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractCargoDependency,
  extractMidenupChannelComponent,
  extractNpmDependency,
  extractYamlKey,
} from "./manifests";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../test/fixtures", name), "utf8");

describe("extractCargoDependency", () => {
  it("reads workspace dependencies (protocol → miden-core)", () => {
    expect(extractCargoDependency(fixture("protocol-cargo.toml"), "miden-core")).toBe("0.29.1");
  });
  it("keeps exact pins verbatim (node → miden-protocol)", () => {
    expect(extractCargoDependency(fixture("node-cargo.toml"), "miden-protocol")).toBe(
      "=0.16.0-rc.4",
    );
  });
  it("accepts plain-string dependencies", () => {
    expect(extractCargoDependency('[dependencies]\nfoo = "1.2.3"\n', "foo")).toBe("1.2.3");
  });
  it("returns null when absent or unparseable", () => {
    expect(extractCargoDependency(fixture("node-cargo.toml"), "nonexistent")).toBeNull();
    expect(extractCargoDependency("not [ toml", "foo")).toBeNull();
  });
});

describe("extractNpmDependency", () => {
  it("reads the wallet's SDK pin", () => {
    const v = extractNpmDependency(fixture("wallet-package.json"), "@miden-sdk/miden-sdk");
    expect(v).toMatch(/^0\.16\./);
  });
  it("returns null when absent or unparseable", () => {
    expect(extractNpmDependency("{}", "x")).toBeNull();
    expect(extractNpmDependency("nope", "x")).toBeNull();
  });
});

describe("extractYamlKey", () => {
  it("reads docs next_version", () => {
    expect(extractYamlKey(fixture("docs-release-manifest.yml"), "next_version")).toBe("0.16");
  });
  it("returns null for missing keys and non-mappings", () => {
    expect(extractYamlKey("a: 1", "b")).toBeNull();
    expect(extractYamlKey("- just\n- a list", "b")).toBeNull();
  });
});

describe("extractMidenupChannelComponent", () => {
  it("finds a component pin inside a named channel", () => {
    const v = extractMidenupChannelComponent(
      fixture("midenup-channel-manifest.json"),
      "0.16.0",
      "client",
    );
    expect(v).toMatch(/^0\.16\./);
  });
  it("returns null for unknown channels/components", () => {
    const text = fixture("midenup-channel-manifest.json");
    expect(extractMidenupChannelComponent(text, "9.9.9", "client")).toBeNull();
    expect(extractMidenupChannelComponent(text, "0.16.0", "flux-capacitor")).toBeNull();
    expect(extractMidenupChannelComponent("junk", "0.16.0", "client")).toBeNull();
  });
});
