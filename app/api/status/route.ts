import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

// Reads through the same 5-minute unstable_cache entry as the page, so SWR
// polling never multiplies upstream GitHub calls.
export async function GET() {
  return Response.json(await getSnapshot());
}
