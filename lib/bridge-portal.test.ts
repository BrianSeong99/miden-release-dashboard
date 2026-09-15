import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";
import { deriveComponentStatus } from "./status-engine";
import { deriveReleaseTiming } from "./release-timing";
import { buildWorkRows } from "./work-table";
import { ok, err } from "./fetch-utils";
import type { DetectedVersion } from "./types";
import type { Detector } from "./schema";

const at = "2026-09-14T00:00:00Z";
const release = {tagName:"v0.1.0",prerelease:false,publishedAt:"2026-07-23T06:56:31Z",htmlUrl:"https://github.com/0xMiden/bridge-portal/releases/tag/v0.1.0"};
const pins: Record<string,string> = {"@miden-sdk/miden-sdk":"0.15.7","@miden-sdk/react":"^0.15.4","@miden-sdk/miden-wallet-adapter-base":"^0.15.1","@miden-sdk/miden-wallet-adapter-react":"^0.15.1"};
const config = (train: string) => loadConfig().release.releases.find((r)=>r.targetVersion === train)!.components.find((c)=>c.id === "bridge-portal")!;
function component(train: string, failed = false) {
  const c = config(train);
  const deps = c.detectors.filter((d)=>d.type === "npm-dep").map((d)=>({detector:d as Detector,result:failed ? err<DetectedVersion>("Source unavailable") : ok({raw:pins[d.dependency],source:d.dependency,url:"https://github.com/0xMiden/bridge-portal/blob/main/package.json",resolution: d.dependency === "@miden-sdk/miden-sdk" ? "exact" as const : "range" as const})}));
  return {...deriveComponentStatus({config:c,releases:ok([release]),depFindings:deps,migrationPrOpen:null,blockers:[],releaseTargetVersion:train}),releaseTiming:deriveReleaseTiming(c,ok({releases:[release],complete:true}),null,at)};
}
describe("Bridge Portal monitoring",()=>{
  it.each(["0.15","0.16","0.17"])("includes the app and all client dependencies for %s",(train)=>{
    const c=config(train);
    expect(c).toMatchObject({repo:"0xMiden/bridge-portal",group:"app",branch:"main",dependsOn:["web-sdk","wallet"]});
    const deps=c.detectors.filter((d)=>d.type === "npm-dep");
    expect(deps.map((d)=>d.dependency)).toEqual(Object.keys(pins));
    expect(deps.every((d)=>d.targetTrain === train)).toBe(true);
    // Adapter 0.15 is not compared numerically with Wallet 1.15.
    expect(deps.filter((d)=>d.dependency.includes("wallet-adapter")).every((d)=>!d.provesComponent)).toBe(true);
  });
  it("maps v0.1.0 only to the 0.15 integration train",()=>{
    expect(component("0.15")).toMatchObject({status:"stable-released",matchedRelease:"0.1.0",matchedPublishedAt:release.publishedAt});
    for(const train of ["0.16","0.17"]){
      const c=component(train);
      expect(c).toMatchObject({expectedVersion:null,status:"not-started",matchedRelease:null});
      expect(c.deps.every((d)=>d.onTarget === false)).toBe(true);
      expect(c.releaseTiming).toMatchObject({latest:release,firstStable:null,latestOnTrain:null});
      expect(buildWorkRows([c],[])[0]).toMatchObject({active:true,date:release.publishedAt,dateLabel:"Latest release (any train)"});
    }
  });
  it("keeps failed dependency evidence unknown rather than inferring readiness from v0.1.0",()=>{
    expect(component("0.16",true).status).toBe("unknown");
  });
});
