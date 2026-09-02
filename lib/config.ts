import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  type AppConfig,
  BlockersFileSchema,
  crossValidate,
  ReleaseConfigSchema,
} from "./schema";

const CONFIG_DIR = path.join(process.cwd(), "config");

function readYaml(file: string): unknown {
  return parseYaml(fs.readFileSync(path.join(CONFIG_DIR, file), "utf8"));
}

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`invalid ${file}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Load and validate all three config files. Throws with a readable message on
 * any violation — used by `scripts/validate-config.ts` (prebuild gate) and at
 * first runtime use, so `next dev` surfaces the same error. */
export function loadConfig(): AppConfig {
  const release = parseOrThrow(ReleaseConfigSchema, readYaml("release.yaml"), "config/release.yaml");
  const blockers = parseOrThrow(BlockersFileSchema, readYaml("blockers.yaml"), "config/blockers.yaml").blockers;
  const config: AppConfig = { release, blockers };
  const problems = crossValidate(config);
  if (problems.length > 0) {
    throw new Error(`invalid config:\n  - ${problems.join("\n  - ")}`);
  }
  return config;
}
