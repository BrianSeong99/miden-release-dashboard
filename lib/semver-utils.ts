import semver from "semver";

/** Normalize a version string as found in manifests and tags:
 * strips `v` prefixes and cargo `=` pins, coerces bare "0.15" to "0.15.0",
 * and keeps prerelease identifiers ("0.16.0-rc.4"). Returns null when the
 * string cannot be read as a version. */
export function normalizeVersion(raw: string): string | null {
  const cleaned = raw.trim().replace(/^[=^~]+/, "").replace(/^v/i, "");
  if (semver.valid(cleaned)) return cleaned;
  const coerced = semver.coerce(cleaned, { includePrerelease: true });
  return coerced ? coerced.version : null;
}

/** True when `version` sits on the `train` release line (major.minor equal).
 * `train` may be "0.16", "0.16.0" or "1.16.0". Prereleases count:
 * 0.16.0-rc.4 is on the 0.16 train. */
export function onTrain(version: string, train: string | null): boolean {
  if (train === null) return false;
  const v = normalizeVersion(version);
  const t = normalizeVersion(train);
  if (!v || !t) return false;
  const pv = semver.parse(v);
  const pt = semver.parse(t);
  if (!pv || !pt) return false;
  return pv.major === pt.major && pv.minor === pt.minor;
}

/** True when `version` is on an EARLIER train than `train`. */
export function beforeTrain(version: string, train: string | null): boolean {
  if (train === null) return false;
  const v = normalizeVersion(version);
  const t = normalizeVersion(train);
  if (!v || !t) return false;
  if (onTrain(v, t)) return false;
  // Compare against the base of the train (e.g. 0.16.0-0 sorts below all 0.16.x).
  const pt = semver.parse(t);
  if (!pt) return false;
  return semver.lt(v, `${pt.major}.${pt.minor}.0-0`);
}

export function isPrerelease(version: string): boolean {
  const v = normalizeVersion(version);
  return v !== null && semver.prerelease(v) !== null;
}

/** Exact equality after normalization: "v0.16.0" equals "0.16.0". */
export function sameVersion(a: string, b: string): boolean {
  const na = normalizeVersion(a);
  const nb = normalizeVersion(b);
  return na !== null && nb !== null && semver.eq(na, nb);
}

/** Sort helper — newest first. Unparseable versions sort last. */
export function compareDesc(a: string, b: string): number {
  const na = normalizeVersion(a);
  const nb = normalizeVersion(b);
  if (!na && !nb) return 0;
  if (!na) return 1;
  if (!nb) return -1;
  return semver.rcompare(na, nb);
}

/** Restrict multi-product repositories to the release tags for one product. */
export function matchesReleaseTag(tag: string, prefixes?: string[]): boolean {
  return prefixes === undefined || prefixes.some((prefix) =>
    tag.startsWith(prefix) && semver.valid(tag.slice(prefix.length)) !== null,
  );
}

/** Cargo interprets bare versions as caret requirements, unlike npm. */
export function cargoRequirement(raw: string): string {
  return raw.split(",").map((part) => /^\s*\d/.test(part) ? `^${part.trim()}` : part.trim()).join(" ");
}

/** A range spanning multiple trains cannot establish a single-train alignment. */
export function requirementOnTrain(raw: string, train: string | null, cargo = false): boolean | null {
  if (!train) return null;
  const version = normalizeVersion(train);
  const parsed = version && semver.parse(version);
  const range = semver.validRange(cargo ? cargoRequirement(raw) : raw);
  if (!parsed || !range) return null;
  const target = `>=${parsed.major}.${parsed.minor}.0-0 <${parsed.major}.${parsed.minor + 1}.0-0`;
  if (semver.subset(range, target, { includePrerelease: true })) return true;
  return semver.intersects(range, target, { includePrerelease: true }) ? null : false;
}
