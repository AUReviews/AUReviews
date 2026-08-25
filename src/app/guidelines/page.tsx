import type { Metadata } from "next";
import Link from "next/link";
import { BODY_MIN_LENGTH } from "@/domain/review";
import {
  DOOR_BLOCK_SUMMARY,
  LEGAL_CONTACT_EMAIL,
  PROHIBITED_CONTENT,
  RETENTION_DAYS,
} from "@/lib/legal";
import LegalPage from "../_components/LegalPage";

// The standalone Review Guidelines page (v1-spec §11/§13; issue #29). The
// in-form panel shows the same `PROHIBITED_CONTENT` list in short form and
// links here. Static.
export const metadata: Metadata = {
  title: "Review Guidelines | AUReviews",
  description: "What AUReviews reviews may and may not contain, and how removal works.",
};

export default function GuidelinesPage() {
  return (
    <LegalPage title="Review Guidelines" effective="August 21, 2026">
      <p>
        AUReviews exists so Auburn students can tell each other what a course was actually like.
        A good review is first-hand, specific, and about the course: what the workload was week
        to week, how the grading worked, what surprised you, how you&rsquo;d prepare.
      </p>

      <h2>The basics</h2>
      <ul>
        <li>
          <strong>Write from your own experience.</strong> Reviews are opinions about a course you
          took, in your own words. State facts only as you experienced them.
        </li>
        <li>
          <strong>Review the course and its instructor of record.</strong> Not TAs, not other
          students, not the department.
        </li>
        <li>
          <strong>At least {BODY_MIN_LENGTH} characters.</strong> Enough to be useful to the next
          person.
        </li>
        <li>
          <strong>You can post more than one review</strong> for the same course (for example,
          after a retake or under a different instructor). We don&rsquo;t limit you to one.
        </li>
        <li>
          <strong>You can edit or delete your own reviews</strong> at any time. Edits go back
          through the same checks as a new post.
        </li>
      </ul>

      <h2>Prohibited content</h2>
      <p>A review that contains any of the following can be removed.</p>
      <dl className="legal-dl">
        {PROHIBITED_CONTENT.map((item) => (
          <div key={item.title}>
            <dt>{item.title}</dt>
            <dd>{item.detail}</dd>
          </div>
        ))}
      </dl>

      <h2>How enforcement works</h2>
      <p>{DOOR_BLOCK_SUMMARY}</p>
      <p>
        We do not pre-screen reviews and we do not claim to read every one. Reviews are published
        as soon as they&rsquo;re posted. A review is removed only if a reader reports it and it is
        found to break these guidelines, if its author deletes it, or if we are legally required
        to remove it.
      </p>
      <p>
        Removal requests from instructors or departments are judged against these same
        guidelines, with no special deference. A negative review that follows the guidelines stays
        up; a review that breaks them comes down, whoever reports it.
      </p>
      <p>
        If your review is removed you&rsquo;ll see the reason on your activity page, and you can
        contest the removal there. Removed content is kept for a limited time (about{" "}
        {RETENTION_DAYS.deleted} days after a self-delete, about {RETENTION_DAYS.removed}{" "}
        days after a removal) so appeals can be resolved, then permanently purged. See the{" "}
        <Link href="/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>Legal requests</h2>
      <p>
        Attorney letters, court orders, copyright notices, and retraction demands are handled
        separately from ordinary reports. Send them to{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
