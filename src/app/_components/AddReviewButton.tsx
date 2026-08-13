"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { addReviewNavHref } from "@/lib/course-detail";

// The context-aware "+ Add Review" nav button (v1-spec §13; issue #40). A
// client child so the shared Header stays a Server Component (no cookies(),
// CDN-static per §8): only this island reads the pathname. On a course detail
// page the link carries that course as `?course=<slug>` prefill; everywhere
// else it is the bare authoring route — the pure `addReviewNavHref` owns that
// rule.
export default function AddReviewButton() {
  const pathname = usePathname();
  return (
    <Link href={addReviewNavHref(pathname)} className="btn-accent">
      + Add Review
    </Link>
  );
}
