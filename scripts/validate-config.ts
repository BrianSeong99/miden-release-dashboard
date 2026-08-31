// Build gate: `npm run build` runs this first (prebuild). A blocker missing an
// owner, exit condition or decision date fails the build with a named field.
import { loadConfig } from "../lib/config";

try {
  const config = loadConfig();
  console.log(
    `config OK — ${config.release.components.length} components, ` +
      `${config.blockers.length} blockers, ${config.pioneers.length} pioneers`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
