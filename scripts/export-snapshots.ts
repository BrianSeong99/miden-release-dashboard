// Build-time snapshot generator for the static (GitHub Pages) deployment:
// writes one JSON file per release to public/data/, which the client fetches
// in place of the server API route the static host cannot run.
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config";
import { buildSnapshot } from "../lib/snapshot";

const outDir = path.join(process.cwd(), "public", "data");

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const versions = loadConfig().release.releases.map((r) => r.targetVersion);
  for (const version of versions) {
    const snapshot = await buildSnapshot(version);
    fs.writeFileSync(path.join(outDir, `${version}.json`), JSON.stringify(snapshot));
    console.log(`public/data/${version}.json — ${snapshot.components.length} components`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
