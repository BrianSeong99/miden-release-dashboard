import { err, ok, truncate } from "./fetch-utils";
import { safeFetch } from "./fetch-utils";
import type { EnvSnapshot, EnvService, Result } from "./types";

// Adapter for the Miden network monitor's public JSON endpoint
// (https://status.{devnet,testnet}.miden.io/status). The schema is
// serde-derived from whatever monitor version is deployed, so parse
// defensively: service names are display strings ("Remote Prover (1)"),
// the service list differs per network, and `error` is free-form remote text.

interface RawService {
  name?: string;
  status?: string;
  error?: string | null;
  details?: Record<string, unknown>;
}

function serviceVersion(details: Record<string, unknown> | undefined): {
  version: string | null;
  blockProducerVersion: string | null;
  chainTip: number | null;
} {
  const out = { version: null as string | null, blockProducerVersion: null as string | null, chainTip: null as number | null };
  if (!details) return out;
  // Externally-tagged enum: { "RpcStatus": {...} } / { "FaucetTest": {...} } / …
  for (const inner of Object.values(details)) {
    if (typeof inner !== "object" || inner === null) continue;
    const o = inner as Record<string, unknown>;
    if (typeof o.version === "string") out.version = o.version;
    if (typeof o.chain_tip === "number") out.chainTip = o.chain_tip;
    const bp = o.block_producer_status;
    if (typeof bp === "object" && bp !== null) {
      const bpv = (bp as Record<string, unknown>).version;
      if (typeof bpv === "string") out.blockProducerVersion = bpv;
    }
    const fm = o.faucet_metadata;
    if (typeof fm === "object" && fm !== null) {
      const fv = (fm as Record<string, unknown>).version;
      if (typeof fv === "string" && out.version === null) out.version = fv;
    }
    const st = o.status;
    if (typeof st === "object" && st !== null) {
      const sv = (st as Record<string, unknown>).version;
      if (typeof sv === "string" && out.version === null) out.version = sv;
    }
  }
  return out;
}

export async function fetchEnvSnapshot(statusUrl: string): Promise<Result<EnvSnapshot>> {
  const res = await safeFetch(statusUrl);
  if (!res.ok) return err(res.error);
  if (!res.value.ok) return err(`status endpoint returned HTTP ${res.value.status}`);
  let body: unknown;
  try {
    body = await res.value.json();
  } catch {
    return err("status endpoint returned non-JSON");
  }
  if (typeof body !== "object" || body === null) return err("unexpected status payload");
  const root = body as {
    services?: RawService[];
    network_name?: string;
    last_updated?: number;
  };
  if (!Array.isArray(root.services)) return err("Status payload has no service list");
  const services: EnvService[] = [];
  let nodeVersion: string | null = null;
  let blockProducerVersion: string | null = null;
  let chainTip: number | null = null;
  for (const raw of root.services ?? []) {
    const name = typeof raw.name === "string" ? raw.name : "unnamed";
    const parsed = serviceVersion(raw.details);
    // Match by prefix — names are display strings and differ per network.
    if (name.startsWith("RPC")) {
      nodeVersion = parsed.version;
      blockProducerVersion = parsed.blockProducerVersion;
      chainTip = parsed.chainTip;
      const rpc = raw.details?.RpcStatus as { block_producer_status?: { status?: string } } | undefined;
      if (parsed.blockProducerVersion) {
        const status = rpc?.block_producer_status?.status;
        services.push({ name: "Block Producer", version: parsed.blockProducerVersion, healthy: !status || status === "Unknown" ? null : status === "Healthy" });
      }
    }
    let probe: EnvService["probe"];
    let probeError: string | undefined;
    for (const detail of Object.values(raw.details ?? {})) {
      if (typeof detail !== "object" || detail === null || !("test" in detail)) continue;
      const test = detail.test;
      if (typeof test === "object" && test !== null && "status" in test) {
        probe = test.status === "Healthy" ? "healthy" : test.status === "Unknown" ? "unknown" : "unhealthy";
        if ("error" in test && typeof test.error === "string") probeError = truncate(test.error, 300);
      }
    }
    services.push({
      probe, probeError,
      name: truncate(name, 60),
      version: parsed.version,
      healthy: !raw.status || raw.status === "Unknown" ? null : raw.status === "Healthy",
    });
  }
  return ok({
    networkName: typeof root.network_name === "string" ? root.network_name : null,
    nodeVersion,
    blockProducerVersion,
    chainTip,
    lastUpdated:
      typeof root.last_updated === "number"
        ? new Date(root.last_updated * 1000).toISOString()
        : null,
    services,
  });
}
