import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  parseRevalidateRequest,
  type RevalidateRequestBody,
} from "@/lib/revalidate";

/**
 * Internal on-demand revalidation endpoint (v1-spec §8).
 *
 * POST with `Authorization: Bearer <REVALIDATE_SECRET>` and a JSON body of
 * `{ "tag": "placeholder" }` and/or `{ "path": "/" }`. The skeleton wires this
 * so later writes can refresh ISR pages; nothing calls it yet.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: RevalidateRequestBody | null = null;
  try {
    body = (await request.json()) as RevalidateRequestBody;
  } catch {
    body = null;
  }

  const plan = parseRevalidateRequest(
    request.headers.get("authorization"),
    body,
    process.env.REVALIDATE_SECRET,
  );

  if (!plan.ok) {
    return NextResponse.json(
      { ok: false, error: plan.error },
      { status: plan.status },
    );
  }

  // Next 16: revalidateTag takes a cacheLife profile as its second arg in route
  // handlers ("max" is the documented value); revalidatePath's type arg is
  // optional. Both purge the matching cache entries so the next read recomputes.
  for (const tag of plan.tags) revalidateTag(tag, "max");
  for (const path of plan.paths) revalidatePath(path);

  return NextResponse.json({
    ok: true,
    revalidated: { tags: plan.tags, paths: plan.paths },
  });
}
