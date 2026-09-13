import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, err } from "./fetch-utils";
import { compareDistribution, fetchPublicManifest } from "./distribution";
import { resolveCargoVersion, runDepDetector } from "./manifests";
import { deriveEnvStatus } from "./status-engine";
import { fetchEnvSnapshot } from "./environments";
import { getWorkEvidence, resolveReleaseRef } from "./github";
import { isCriticalReleaseBlocker, nextWorkAction } from "./release-work";
import { requirementOnTrain } from "./semver-utils";
import { eventGap, workTiming } from "./work-timing";
import type { BlockerView, EnvService } from "./types";

const item = (overrides: Partial<BlockerView> = {}): BlockerView => ({
  id: "migration", title: "Migration", severity: "critical", category: "blocker", kind: "pull-request", stage: "compiler",
  owner: "implementer", exitCondition: "Merge", nextDecisionDate: null, url: "https://github.com/o/r/pull/1",
  live: { state: "open", checkedAt: "2026-09-12T00:00:00Z" }, ...overrides,
});
afterEach(() => vi.unstubAllGlobals());

describe("source versus published distribution", () => {
  const manifest = (version = "0.16.1", alias = "0.16.0") => JSON.stringify({ networks: { testnet: alias }, channels: [
    { name: "0.16.0", components: [{ name: "protocol", version: { kind: "registry", version } }] },
  ] });
  const compare = (a: string, b: string) => compareDistribution(ok(a), ok(b), "0.16.0", "https://github.com/o/r", "https://o.github.io/r/manifest.json");
  it("requires public channel versions and relevant aliases to match source", () => {
    expect(compare(manifest(), manifest()).state).toBe("published");
    expect(compare(manifest(), manifest("0.16.0-rc.9")).state).toBe("pending");
    const aliases = compare(manifest(), manifest("0.16.1", "0.15.0"));
    expect(aliases.state).toBe("pending");
    expect(aliases.changes[0]).toContain("testnet alias");
  });
  it("ignores edits to unrelated channels", () => {
    const source = JSON.parse(manifest());
    source.channels.push({ name: "0.17.0", components: [] });
    source.networks.experimental = "0.17.0";
    expect(compare(JSON.stringify(source), manifest()).state).toBe("published");
  });
  it("keeps failed, malformed and absent source evidence unknown", () => {
    expect(compareDistribution(err("offline"), ok(manifest()), "0.16.0", "source", "public").state).toBe("unknown");
    expect(compare("invalid", manifest()).state).toBe("unknown");
    expect(compare('{"channels":[],"networks":{}}', manifest()).state).toBe("unknown");
    expect(compare(manifest(), '{"channels":[],"networks":{}}').state).toBe("pending");
  });
  it("fetches public evidence without GitHub credentials and preserves failures", async () => {
    const fetch = vi.fn(async () => new Response(manifest())); vi.stubGlobal("fetch", fetch);
    expect((await fetchPublicManifest("https://o.github.io/r/manifest.json")).ok).toBe(true);
    expect(fetch.mock.calls[0]?.length).toBeGreaterThan(0);
    vi.stubGlobal("fetch", async () => new Response("offline", { status: 503 }));
    expect((await fetchPublicManifest("https://o.github.io/r/manifest.json")).ok).toBe(false);
  });
});

describe("dependency declarations and resolution", () => {
  const manifest = '[workspace.dependencies]\nmiden-protocol = "0.16"\n';
  const lock = (version: string) => `[[package]]\nname = "miden-protocol"\nversion = "${version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;
  it("does not infer a single train from an overlapping or non-version requirement", () => {
    expect(requirementOnTrain(">=0.16 <0.18", "0.16")).toBeNull();
    expect(requirementOnTrain("^0.16.0", "0.16")).toBe(true);
    expect(requirementOnTrain("0.15", "0.16", true)).toBe(false);
    expect(requirementOnTrain("https://github.com/o/r", "0.16")).toBeNull();
  });
  it("resolves the actual patch, not the minimum in the declared range", () => {
    expect(resolveCargoVersion(manifest, lock("0.16.1"), "miden-protocol", "0.16")).toBe("0.16.1");
    expect(resolveCargoVersion(manifest, lock("0.17.0"), "miden-protocol", "0.16")).toBeNull();
  });
  it("does not resolve ambiguous, overridden or non-registry packages", () => {
    expect(resolveCargoVersion(manifest, lock("0.16.1") + lock("0.16.2"), "miden-protocol", "0.16")).toBeNull();
    expect(resolveCargoVersion(manifest + '[patch.crates-io]\nmiden-protocol = { path = "local" }', lock("0.16.1"), "miden-protocol", "0.16")).toBeNull();
    expect(resolveCargoVersion(manifest.replace('"0.16"', '{version="0.16",git="https://github.com/o/r"}'), lock("0.16.1"), "miden-protocol", "0.16")).toBeNull();
    expect(resolveCargoVersion(manifest, lock("0.16.1").replace("registry+", "git+"), "miden-protocol", "0.16")).toBeNull();
    expect(resolveCargoVersion("bad [", lock("0.16.1"), "miden-protocol", "0.16")).toBeNull();
  });
  it("uses the same ref for declarations and lock evidence", async () => {
    const read = vi.fn(async (_repo: string, path: string, _ref: string) => ok(path === "Cargo.lock" ? lock("0.16.1") : manifest));
    const result = await runDepDetector("o/r", "a".repeat(40), {type:"cargo-dep",path:"Cargo.toml",dependency:"miden-protocol"}, read);
    expect(result).toMatchObject({ok:true,value:{raw:"0.16",resolvedVersion:"0.16.1",resolution:"locked"}});
    expect(read.mock.calls.every((call) => call[2] === "a".repeat(40))).toBe(true);
  });
  it("keeps npm ranges distinct and invalid files unknown", async () => {
    const detector = {type:"npm-dep",path:"package.json",dependency:"sdk"} as const;
    expect(await runDepDetector("o/r","main",detector,async () => ok('{"dependencies":{"sdk":"^0.16.0"}}'))).toMatchObject({value:{resolution:"range"}});
    expect(await runDepDetector("o/r","main",detector,async () => ok('{"dependencies":{"sdk":"0.16.1"}}'))).toMatchObject({value:{resolution:"exact"}});
    expect(await runDepDetector("o/r","main",detector,async () => ok('invalid'))).toMatchObject({ok:false});
  });
});

describe("service version and usable probe evidence", () => {
  const env = (services: EnvService[], targets?: Record<string,string|null>) => deriveEnvStatus({id:"devnet",label:"DevNet",statusUrl:"https://status.devnet.miden.io/status",expectedVersion:"0.16", serviceVersions:targets,
    snapshot:ok({networkName:"devnet",nodeVersion:"0.16.0",blockProducerVersion:"0.16.0",chainTip:1,lastUpdated:null,services})});
  it("accepts Note Transport's independent version only with a target mapping", () => {
    const services = [{name:"Note Transport",version:"0.5.0-rc.2",healthy:true}];
    expect(env(services,{"Note Transport":"0.5"}).status).toBe("current");
    expect(env(services).status).toBe("unknown");
    expect(env(services,{"Note Transport":"0.6"}).status).toBe("partial");
  });
  it("does not turn a healthy version into a verified proving test", () => {
    expect(env([{name:"Remote Prover (1)",version:"0.16.0",healthy:true,probe:"unknown"}]).status).toBe("unknown");
    expect(env([{name:"RPC",version:"0.16.0",healthy:false}]).status).toBe("partial");
    expect(env([{name:"Remote Prover (1)",version:"0.16.0",healthy:true,probe:"healthy"}]).status).toBe("current");
  });
  it("parses nested probes and preserves unknown health", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({services:[{name:"Remote Prover",status:"Healthy",details:{RemoteProverStatus:{status:{version:"0.16.0"},test:{status:"Unknown",error:"Fee-funded probe required"}}}},{name:"Other",status:"Unknown"}]})));
    const result = await fetchEnvSnapshot("https://status.devnet.miden.io/status");
    expect(result).toMatchObject({ok:true,value:{services:[{probe:"unknown",probeError:"Fee-funded probe required",healthy:true},{healthy:null}]}});
  });
});

describe("scoped handoffs and event timing", () => {
  it("does not elevate an outcome blocker to a global release blocker", () => {
    expect(isCriticalReleaseBlocker(item())).toBe(true);
    expect(isCriticalReleaseBlocker(item({gateScope:"outcome"}))).toBe(false);
  });
  it("derives concrete actions without assuming approval or assigning reviewers as owners", () => {
    const base = {draft:false,reviewers:["reviewer"],checks:"passing" as const,openedAt:null,readyAt:null,mergedAt:null};
    expect(nextWorkAction(item({workflow:base}))).toBe("Review requested");
    expect(nextWorkAction(item({workflow:{...base,draft:true}}))).toContain("Finish draft");
    expect(nextWorkAction(item({workflow:{...base,checks:"failing"}}))).toBe("Fix failing checks");
    expect(nextWorkAction(item({workflow:{...base,checks:"pending"}}))).toBe("Wait for checks");
    expect(nextWorkAction(item())).toBe("Check PR readiness");
    expect(nextWorkAction(item({live:{state:"unknown",error:"offline",checkedAt:"now"}}))).toBe("Verify GitHub state");
  });
  it("measures recorded intervals and rejects inverted dates", () => {
    expect(eventGap("2026-09-10T00:00:00Z","2026-09-11T00:00:00Z")).toBe(86400000);
    expect(eventGap("2026-09-11T00:00:00Z","2026-09-10T00:00:00Z")).toBeNull();
    expect(eventGap("bad", "bad")).toBeNull();
    expect(workTiming(item(),"2026-09-12T00:00:00Z").openWaitMs).toBeNull();
    expect(workTiming(item({workflow:{draft:false,reviewers:[],checks:"passing",openedAt:"2026-09-10T00:00:00Z",readyAt:"2026-09-11T00:00:00Z",mergedAt:null}}),"2026-09-12T00:00:00Z")).toMatchObject({preparationMs:86400000,reviewMs:null,openWaitMs:86400000});
  });
});

describe("GitHub workflow adapter", () => {
  function route(overrides: Record<string, unknown> = {}) {
    vi.stubGlobal("fetch", async (url: string) => {
      const key = url.includes("check-runs") ? "checks" : url.includes("/status?") ? "statuses" : url.includes("timeline?") ? "timeline" : "pr";
      const defaults: Record<string,unknown> = {pr:{draft:false,created_at:"2026-09-10T00:00:00Z",merged_at:null,requested_reviewers:[{login:"reviewer"}],head:{sha:"a".repeat(40)}}, checks:{total_count:1,check_runs:[{status:"completed",conclusion:"success"}]}, statuses:{state:"pending",total_count:0,statuses:[]},timeline:[{event:"ready_for_review",created_at:"2026-09-11T00:00:00Z"}]};
      return new Response(JSON.stringify(key in overrides ? overrides[key] : defaults[key]));
    });
  }
  it("captures review events and current-head checks", async () => {
    route(); expect(await getWorkEvidence("o/r",1)).toMatchObject({ok:true,value:{checks:"passing",reviewers:["reviewer"],readyAt:"2026-09-11T00:00:00Z"}});
  });
  it("keeps capped checks and timelines unknown", async () => {
    route({checks:{total_count:101,check_runs:[]},timeline:Array.from({length:100},()=>({event:"ready_for_review",created_at:"2026-09-11T00:00:00Z"}))});
    expect(await getWorkEvidence("o/r",1)).toMatchObject({ok:true,value:{checks:"unknown",readyAt:null}});
  });
  it("honors draft transitions and failed or pending checks", async () => {
    route({checks:{total_count:1,check_runs:[{status:"completed",conclusion:"failure"}]},timeline:[{event:"ready_for_review",created_at:"2026-09-11T00:00:00Z"},{event:"convert_to_draft"}]});
    expect(await getWorkEvidence("o/r",1)).toMatchObject({value:{checks:"failing",readyAt:null}});
    route({checks:{total_count:1,check_runs:[{status:"queued",conclusion:null}]}});
    expect(await getWorkEvidence("o/r",1)).toMatchObject({value:{checks:"pending"}});
  });
  it("rejects malformed PR metadata and unresolved release refs", async () => {
    route({pr:{}}); expect((await getWorkEvidence("o/r",1)).ok).toBe(false);
    vi.stubGlobal("fetch",async () => new Response('{"sha":"not-a-commit"}'));
    expect((await resolveReleaseRef("o/r","v0.16.0")).ok).toBe(false);
    vi.stubGlobal("fetch",async () => new Response(JSON.stringify({sha:"b".repeat(40)})));
    expect(await resolveReleaseRef("o/r","v0.16.0")).toMatchObject({ok:true,value:"b".repeat(40)});
  });
});
