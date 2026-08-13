import { NextResponse } from "next/server";
import { getCurrentIdentityHash } from "@/auth/session";
import { isUuid } from "@/domain";
import { listViewerVotes } from "@/db/queries";

/**
 * The signed-in viewer's helpful votes on one course's reviews (issue #25):
 * `GET /api/votes?course=<courseId>` → `{ signedIn, votes: { [reviewId]:
 * "up" | "down" } }`. Course pages are shared CDN-static HTML (§8), so
 * per-viewer vote state can never bake into them — the reviews island fetches
 * it here after mount instead. Only vote *directions* keyed by review id ever
 * leave the server; the identity hash resolving them does not (§7).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const courseId = new URL(request.url).searchParams.get("course");
  if (!courseId || !isUuid(courseId)) {
    return NextResponse.json(
      { error: "`course` must be a course id." },
      { status: 400 },
    );
  }

  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) {
    return NextResponse.json({ signedIn: false, votes: {} });
  }

  const votes = await listViewerVotes(courseId, identityHash);
  return NextResponse.json({ signedIn: true, votes });
}
