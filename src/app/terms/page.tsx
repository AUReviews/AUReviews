import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_CONTACT_EMAIL,
  NON_AFFILIATION_DISCLAIMER,
  PROHIBITED_CONTENT,
} from "@/lib/legal";
import LegalPage from "../_components/LegalPage";

// Terms of Service (v1-spec §10; issue #29). Placeholder-final copy: items
// marked `🔴 attorney` in comments are confirmed by the pre-launch consult.
export const metadata: Metadata = {
  title: "Terms of Service — AUReviews",
  description: "The terms for using AUReviews and posting course reviews.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effective="August 21, 2026">
      <p>
        These Terms govern your use of AUReviews (the &ldquo;Site&rdquo;). By using the Site, and
        especially by posting a review, you agree to them. If you don&rsquo;t agree, don&rsquo;t
        use the Site.
      </p>

      <h2>1. Who can post</h2>
      <p>
        To post a review, vote, or otherwise contribute, you must be at least 18 years old and
        verify a current Auburn email address (<code>@auburn.edu</code> or{" "}
        <code>@tigermail.auburn.edu</code>). Anyone can read the Site.
      </p>

      <h2>2. Not affiliated with Auburn University</h2>
      <p>{NON_AFFILIATION_DISCLAIMER}</p>
      <p>
        Course and instructor listings are imported from public university sources to identify
        what is being reviewed. Their presence here does not imply any endorsement by, or
        relationship with, the university or the people named.
      </p>

      <h2>3. Your content</h2>
      <p>
        You own what you write. By posting, you give AUReviews a non-exclusive, royalty-free,
        worldwide license to host, display, reproduce, and distribute your review on the Site and
        in the Site&rsquo;s feeds and aggregates, for as long as the review is live. The license
        ends when you delete the review, except for the limited retention described in the{" "}
        <Link href="/privacy">Privacy Policy</Link>. We do not claim ownership of your content and
        do not sell it.
      </p>
      <p>When you post, you represent that:</p>
      <ul>
        <li>the review reflects your own first-hand experience of the course;</li>
        <li>you are not knowingly posting anything false;</li>
        <li>
          it follows the <Link href="/guidelines">Review Guidelines</Link>, which are part of
          these Terms.
        </li>
      </ul>

      <h2>4. Prohibited content and conduct</h2>
      <p>
        The <Link href="/guidelines">Review Guidelines</Link> list what may not be posted:{" "}
        {PROHIBITED_CONTENT.map((p) => p.title.toLowerCase()).join("; ")}. You also may not
        upload course materials (exams, slides, assignments) — reviews only — or attempt to interfere with the
        Site&rsquo;s operation or other users&rsquo; anonymity.
      </p>

      <h2>5. Removal and account actions</h2>
      <p>
        We may remove any content or restrict any account at our discretion, with or without
        notice, including for violating these Terms or the Guidelines. Removed reviews drop from
        the Site and its averages immediately. If one of your reviews is removed you can see why,
        and contest it, on your activity page.
      </p>

      <h2>6. Reviews are user opinions</h2>
      <p>
        Reviews and ratings are written by individual users and reflect their own views. AUReviews
        does not author, verify, or endorse them. Averages are a neutral calculation over the
        ratings users submit. Nothing on the Site is a statement by AUReviews about any course,
        instructor, or the university.
      </p>

      <h2>7. No warranty</h2>
      <p>
        The Site is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
        of any kind, express or implied, including accuracy, availability, merchantability, or
        fitness for a particular purpose.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, AUReviews and its operator are not liable for any
        indirect, incidental, consequential, or punitive damages, or for any loss arising from
        your use of the Site or reliance on its content. Our total liability for any claim is
        limited to $100.
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to defend and hold harmless AUReviews and its operator from claims, damages, and
        expenses (including reasonable attorney fees) arising from content you post or your
        violation of these Terms.
      </p>

      <h2>10. Governing law</h2>
      {/* 🔴 attorney: finalize governing law, venue, and any arbitration clause. */}
      <p>
        These Terms are governed by the laws of the State of Alabama, without regard to its
        conflict-of-law rules. Any dispute will be brought in the state or federal courts located
        in Lee County, Alabama.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms. The date at the top shows the latest revision; continuing to
        use the Site after a change means you accept it.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions, legal notices, copyright notices, and retraction demands:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
