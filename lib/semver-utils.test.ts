import { describe, expect, it } from "vitest";
import {
  beforeTrain,
  compareDesc,
  isPrerelease,
  normalizeVersion,
  onTrain,
  sameVersion,
} from "./semver-utils";

describe("normalizeVersion", () => {
  it("strips v prefixes and = pins", () => {
    expect(normalizeVersion("v0.16.0-rc.7")).toBe("0.16.0-rc.7");
    expect(normalizeVersion("=0.16.0-rc.4")).toBe("0.16.0-rc.4");
    expect(normalizeVersion("^0.15.3")).toBe("0.15.3");
  });
  it("coerces bare major.minor (cargo style)", () => {
    expect(normalizeVersion("0.15")).toBe("0.15.0");
    expect(normalizeVersion("0.16")).toBe("0.16.0");
  });
  it("returns null for junk", () => {
    expect(normalizeVersion("main")).toBeNull();
    expect(normalizeVersion("")).toBeNull();
  });
});

describe("onTrain", () => {
  it("prereleases sit on their train", () => {
    expect(onTrain("0.16.0-rc.4", "0.16")).toBe(true);
    expect(onTrain("0.16.0-alpha.1", "0.16.0")).toBe(true);
  });
  it("wallet 1.x trains are distinct from 0.x", () => {
    expect(onTrain("1.16.0-rc.0", "1.16.0")).toBe(true);
    expect(onTrain("1.16.0-rc.0", "0.16")).toBe(false);
  });
  it("previous trains do not match", () => {
    expect(onTrain("0.15.9", "0.16")).toBe(false);
  });
});

describe("beforeTrain", () => {
  it("previous train is before", () => {
    expect(beforeTrain("0.15.3", "0.16")).toBe(true);
  });
  it("same train is not before", () => {
    expect(beforeTrain("0.16.0-rc.1", "0.16")).toBe(false);
  });
  it("later train is not before", () => {
    expect(beforeTrain("0.17.0-rc.2", "0.16")).toBe(false);
  });
});

describe("isPrerelease / sameVersion / compareDesc", () => {
  it("detects prereleases including rc.0", () => {
    expect(isPrerelease("1.16.0-rc.0")).toBe(true);
    expect(isPrerelease("0.30.0")).toBe(false);
  });
  it("tag equals expected after normalization", () => {
    expect(sameVersion("v0.30.0", "0.30.0")).toBe(true);
    expect(sameVersion("v0.30.0", "0.30.1")).toBe(false);
  });
  it("orders rc below the stable and newest first", () => {
    expect(compareDesc("0.16.0-rc.4", "0.16.0")).toBeGreaterThan(0);
    expect(compareDesc("v0.16.0-rc.7", "v0.16.0-rc.2")).toBeLessThan(0);
  });
});
