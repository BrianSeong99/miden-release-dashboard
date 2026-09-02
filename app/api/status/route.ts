import type { NextRequest } from "next/server";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

// Reads through the same per-release 5-minute unstable_cache entries as the
// page, so SWR polling never multiplies upstream GitHub calls.
export async function GET(request: NextRequest) {
  const release = request.nextUrl.searchParams.get("release") ?? undefined;
  return Response.json(await getSnapshot(release));
}
