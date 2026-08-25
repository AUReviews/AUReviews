import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, RETENTION_DAYS } from "@/lib/legal";
import LegalPage from "../_components/LegalPage";

// Privacy Policy (v1-spec §7/§10/§11; issue #29). Describes what the §7
// data-minimization architecture actually retains; this page IS the
// anonymity promise, so keep it in step with src/auth and src/db/schema.ts.
// Review retention is the §11 soft-delete window (RETENTION_DAYS, issue #26)
// applied by the operator via runbook/purge-tombstones.sql, not a scheduled job;
// the copy says "about" for that reason. email_send_log has no purge yet.
// Items marked `🔴 attorney` in comments are confirmed by the pre-launch consult.
export const metadata: Metadata = {
  title: "Privacy Policy | AUReviews",
  description: "What AUReviews collects, what it keeps, and for how long.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effective="August 21, 2026">
      <p>
        AUReviews is built so that a review can&rsquo;t be traced back to the student who wrote
        it, not by readers and not by us. This page explains what that means in practice.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Auburn email, briefly.</strong> When you sign in we send a one-time code to
          your Auburn address (<code>@auburn.edu</code>).
          We do not store the address. We store a one-way keyed hash of it; the key lives outside the database. The hash lets us recognize you
          when you come back and attribute your reviews to you, but it cannot be turned back into
          your email.
        </li>
        <li>
          <strong>Your reviews and votes</strong>, linked to that hash, never to your name or
          email.
        </li>
        <li>
          <strong>A session cookie</strong> that keeps you signed in.
        </li>
        <li>
          <strong>Sign-in request logs</strong> (a hashed address and an IP address) used only to
          rate-limit sign-in emails. Only a short trailing window is ever consulted.
        </li>
        <li>
          <strong>Aggregate analytics</strong> (page views, performance) from our hosting
          provider. We do not run advertising or cross-site trackers.
        </li>
      </ul>
      <p>We never collect your name, student ID, or any university account credentials.</p>

      <h2>What we don&rsquo;t do</h2>
      <ul>
        <li>We don&rsquo;t show your email, hash, or any identifier next to a review.</li>
        <li>We don&rsquo;t sell or share personal data with anyone.</li>
        <li>We don&rsquo;t send email except the sign-in code you ask for.</li>
      </ul>

      <h2>Retention and deletion</h2>
      {/* 🔴 attorney: confirm these windows against litigation-hold duties. */}
      <ul>
        <li>
          <strong>Live reviews</strong> stay up until you delete them, we remove them under the{" "}
          <Link href="/guidelines">Review Guidelines</Link>, or we are legally required to remove
          them.
        </li>
        <li>
          <strong>Deleted reviews</strong> are kept for about {RETENTION_DAYS.deleted} days
          after you delete them, and about {RETENTION_DAYS.removed} days after we remove
          one, so that appeals and abuse investigations can be resolved. After that the text and
          ratings are permanently purged; only a minimal record (course, date, and the hashed
          identity) remains so repeat abuse can be detected.
        </li>
        <li>
          <strong>Sign-in codes</strong> expire within minutes.
        </li>
        <li>
          <strong>Sessions</strong> end when you sign out or they expire.
        </li>
      </ul>

      <h2>Legal requests and subpoenas</h2>
      {/* 🔴 attorney: confirm the notification practice and Alabama unmasking standard. */}
      <p>
        Because we don&rsquo;t store your email or name, there is very little we could hand over
        even if compelled. If we receive a subpoena, court order, or other legal demand seeking
        information about a reviewer, our practice is to notify the affected account through the
        Site before responding, where the law allows, so you have a chance to object, and to
        produce only what we are legally required to produce.
      </p>

      <h2>Children</h2>
      <p>The Site is for adults. You must be 18 or older to post.</p>

      <h2>Changes</h2>
      <p>
        We may update this policy; the date at the top shows the latest revision. Material
        changes to what we retain will be noted on this page.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions and legal notices:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
