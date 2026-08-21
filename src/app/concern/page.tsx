import { ConcernForm } from "./concern-form";

// Ungated, site-wide "Report a concern" (v1-spec §11/§12/§13; issue #27).
// Reachable from the footer on every page; no sign-in, no @auburn.edu gate.
// Distinct from the per-review "Report" action on a course page, which is
// for flagging one specific review against the guidelines.
export const metadata = {
  title: "Report a concern — AUReviews",
};

export default function ConcernPage() {
  return (
    <main className="signin">
      <div className="signin-card">
        <h1>Report a concern</h1>
        <p className="lede">
          Spotted a bug, want something taken down, or have anything else for the
          person running the site? Send it here. <strong>No sign-in needed.</strong>
        </p>
        <p className="signin-foot">
          To flag one specific review, use the <strong>Report</strong> link under
          that review on its course page instead.
        </p>
        <ConcernForm />
      </div>
    </main>
  );
}
