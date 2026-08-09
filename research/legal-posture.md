# Legal Posture: Hosting Anonymous Student Reviews That Name Auburn Faculty

Research for **PlainsCourses** — resolves issue [#4](https://github.com/PlainsCourses/PlainsCourses/issues/4). Parent map: [#1](https://github.com/PlainsCourses/PlainsCourses/issues/1).

Prepared 2026-08-04.

---

## ⚠️ NOT LEGAL ADVICE

**This is product-decision research, not legal advice, and its author is not a lawyer.** It summarizes publicly available statutes, court opinions, and policies to inform how the v1 spec should be shaped. It does **not** create an attorney-client relationship, and it should not be relied on as a substitute for advice from a licensed attorney.

Nothing here is a guarantee of any legal outcome. Statutes and case law change; several questions below (especially the Alabama-specific ones and the trademark clearance of a specific name) have **no clear answer from public sources and require a licensed attorney.** Points where a lawyer is genuinely needed before launch are marked **🔴 LAWYER BEFORE LAUNCH** throughout, and collected at the end.

The single most valuable pre-launch action is a **one-time consult with an attorney licensed in Alabama** who handles First Amendment / media / internet law, to (a) clear the chosen name and domain against Auburn's marks, (b) review the Terms of Service, review guidelines, and takedown process, and (c) advise on the anonymous-poster data-retention posture given Alabama law. This is a bounded, affordable engagement, not open-ended litigation counsel.

---

## Executive summary

- **The legal model is sound and well-precedented.** RateMyProfessors, PolyRatings (Cal Poly), Bruinwalk (UCLA), Koofers, and the OMSCentral family of sites have operated for years doing essentially what PlainsCourses proposes. The dominant outcome when professors object is that they cannot force removal of on-topic negative reviews.
- **Section 230 is the backbone.** As an interactive computer service hosting reviews written by others, PlainsCourses is generally not treated as the publisher/speaker of those reviews (47 U.S.C. § 230(c)(1)). Crucially, **moderating, curating, editing for length/format, and removing content does not by itself forfeit this immunity** — Section 230 was designed to encourage exactly that. The immunity is only endangered if the site itself *creates or materially contributes to* the unlawful part of the content.
- **Defamation is the real (but manageable) exposure**, and it runs primarily against the *student author*, not the site. The design north star ("honest workload numbers," structured/numeric data, opinion-framed prose) already pushes content toward constitutionally protected opinion and away from actionable false-fact assertions.
- **Anonymity is protected but not absolute.** A determined professor can seek to unmask a reviewer via a John Doe suit and subpoena. What the site *can be compelled to hand over is limited to what it retains.* Data minimization is the primary defense and it is a design decision, not a legal one.
- **Auburn's trademarks are a real constraint on branding.** "Auburn," "War Eagle," "AU," and the logos are registered marks. Using them in the site *name, domain, or logo* is the risk; using them *descriptively in body copy* ("reviews of Auburn University courses") is much safer under nominative fair use. `plainscourses.com` (no Auburn mark) is the low-risk choice, paired with a prominent unaffiliated-disclaimer.
- **Auburn policy reaches the student personally, not the independent site** — provided the site touches **no** university IT resources, credentials, or non-public data, and does not imply university endorsement.

---

## 1. Section 230 — intermediary immunity and the moderation question

### The statute

47 U.S.C. § 230(c)(1): *"No provider or user of an interactive computer service shall be treated as the publisher or speaker of any information provided by another information content provider."* (Source: [Cornell LII, 47 U.S.C. § 230](https://www.law.cornell.edu/uscode/text/47/230).)

Definitions in § 230(f): an *"interactive computer service"* is "any information service, system, or access software provider that provides or enables computer access by multiple users to a computer server" — construed broadly to cover ordinary websites. An *"information content provider"* is "any person or entity that is responsible, in whole or in part, for the creation or development of information." A single actor can be **both** — the immunity turns on whether the site created the specific content that is the basis of the claim. (Source: CRS In Focus IF12584, *Section 230: A Brief Overview*, Feb. 2, 2024, [crsreports.congress.gov](https://crsreports.congress.gov).)

### Does moderating / curating / editing forfeit protection? — the crux for the moderation decision

**No — moderation does not forfeit § 230(c)(1), and the statute affirmatively protects it.** This is the settled, foundational reading:

- The leading case, *Zeran v. America Online, Inc.*, 129 F.3d 327, 330 (4th Cir. 1997), holds that § 230 bars "lawsuits seeking to hold a service provider liable for its exercise of a publisher's traditional editorial functions — such as deciding whether to publish, withdraw, postpone, or alter content." (Source: quoted in CRS IF12584.) In other words, choosing what to keep up, taking things down, and editing are precisely the protected acts.
- EFF's operator guidance is explicit: *"Section 230 prevents you from being held liable even if you exercise the usual prerogative of publishers to edit the material you publish."* Site operators "can edit, delete, and moderate comments without losing immunity." (Source: [EFF, Section 230 Protections](https://www.eff.org/issues/bloggers/legal/liability/230).)
- Separately, § 230(c)(2)(A) provides an independent "Good Samaritan" immunity for "any action voluntarily taken in good faith to restrict access to or availability of material that the provider or user considers to be obscene, lewd, lascivious, filthy, excessively violent, harassing, or **otherwise objectionable**." (Source: Cornell LII.) This directly covers removing harassing or abusive reviews.

**The limit that actually matters for a structured review site — the "material contribution" / *Roommates.com* line.** Immunity applies only to "information provided by another information content provider." A site loses immunity if it "materially contributes" to what makes content unlawful — i.e., if it is "responsible for what makes the displayed content illegal." (Source: CRS IF12584.) The governing case is *Fair Housing Council of San Fernando Valley v. Roommates.com*, 521 F.3d 1157 (9th Cir. 2008) (en banc): the site lost immunity for **required** dropdown questions that forced users to state housing preferences violating fair-housing law, because the site *designed the illegal content into the form* — but it kept immunity for a free-text "Additional Comments" box, because open-ended prompts are "neutral tools." *Jones v. Dirty World Entertainment Recordings*, 755 F.3d 398 (6th Cir. 2014), similarly held that merely selecting, encouraging, or adding editorial commentary to user posts is not "material contribution" absent the operator specifically authoring the tortious material.

**What this means concretely for PlainsCourses design:**

| Safe (preserves § 230) | Dangerous (risks becoming a content creator) |
|---|---|
| Neutral structured fields: hours/week, difficulty scale, letter grade, term, instructor picker | A **required** dropdown whose options are themselves defamatory (e.g. a preset "This professor is: [incompetent / a bigot / …]") |
| Free-text review box with neutral prompts ("Describe the workload") | Editorializing that changes meaning — e.g. deleting "not" from "he does **not** discriminate" |
| Removing, hiding, or declining to publish reviews (any reason, in good faith) | Writing headlines/summaries that assert new facts about a professor |
| Computing aggregate scores/averages from user-submitted numbers | Staff-authored "hot takes" appended to a professor's page |
| Fixing typos, truncating length, formatting | Soliciting or rewarding specific accusatory content about a named person |

**Design rule:** every *prompt/option the site supplies* must be neutral and non-accusatory; every *substantive claim about a person* must originate entirely in the user's free text. Aggregating user-supplied numbers into an average is a "neutral tool" and does not make the site the author of the underlying ratings.

### Exceptions to § 230 (things it does NOT cover)

Per § 230(e) and CRS IF12584: (1) federal criminal law; (2) **intellectual property** law — including **copyright and trademark** (relevant to course-catalog data and to the Auburn-marks question, both handled outside § 230); (3) the Electronic Communications Privacy Act / wiretap law; (4) state laws only to the extent consistent with § 230; (5) FOSTA sex-trafficking claims. Note that § 230 is a *federal* defense to *state* defamation claims and preempts inconsistent state law (§ 230(e)(3)).

---

## 2. Defamation — where the opinion/fact line sits, and how review sites stay on the safe side

### The doctrine

Defamation requires a **false statement of fact** — one that is *provably false*. The Supreme Court in *Milkovich v. Lorain Journal Co.*, 497 U.S. 1 (1990) held there is **no separate, blanket "opinion" privilege**; the real test is whether a statement "is sufficiently factual to be susceptible of being proved true or false." A statement framed as opinion is still actionable if it *implies* undisclosed defamatory facts. Conversely, statements that cannot be objectively verified, or that are rhetorical/hyperbolic, are protected. (This is the anchor doctrine; confirm current articulation with counsel.)

The practical test courts apply (per the Digital Media Law Project's opinion guide) weighs: **verifiability** (can it be proven false?), the **common meaning** of the words, the **full context**, and the **conventions of the medium** (a review site reads as subjective commentary). Critically, an opinion *based on disclosed facts* is protected because readers can judge the inference themselves — DMLP's example: "In my opinion Carol is an alcoholic" is risky, but "I've seen Carol drink heavily five times in six months, so in my opinion she has a problem" is protected because the factual basis is stated. (Source: [DMLP, Opinion and Fair Comment Privileges](http://www.dmlp.org/legal-guide/opinion-and-fair-comment-privileges); [EFF, Defamation](https://www.eff.org/issues/bloggers/legal/liability/defamation).)

Applied to the ticket's own examples:
- **"Worst class I have ever taken"** — protected opinion. Subjective, unverifiable, classic hyperbole.
- **"He does not grade the exams"** — an actionable *factual* assertion. It is a specific, provably-true-or-false claim about the professor's conduct. This is exactly the category the guidelines must channel into safer framing ("I don't feel my exams were graded carefully" / "returned with no marks") **or** must require the reviewer to be stating first-hand experience.

### How comparable litigation has come out

- **McKee v. Laurion, 825 N.W.2d 725 (Minn. 2013):** a physician sued over critical "rate-your-doctor" reviews; the Minnesota Supreme Court held **none** of the statements were actionable because each was protected opinion, substantially true, or not capable of defamatory meaning. Strong precedent that candid, experience-based online reviews of a professional are protected. (Source: [Justia, McKee v. Laurion](https://law.justia.com/cases/minnesota/supreme-court/2013/a11-1154.html).)
- **ZL Technologies, Inc. v. Doe, 13 Cal.App.5th 603 (2017):** the flip side — anonymous Glassdoor reviews that contained **false assertions of fact** were *not* protected, and the plaintiff was allowed to proceed toward unmasking after making a prima facie defamation showing. Shows the boundary: verifiable false-fact claims lose protection. (Source: [Justia, ZL Technologies v. Doe](https://law.justia.com/cases/california/court-of-appeal/2017/a143680.html).)
- **Vogl-Bauer v. Llewellyn (Wis., 2014):** a professor sued a former student over online reviews/videos — illustrating that the realistic defendant is the *individual author*, not the platform, and that these suits do get filed even when weak. (Source: [Inside Higher Ed, May 23 2014](https://www.insidehighered.com/news/2014/05/23/professor-sues-student-over-online-reviews-her-course).)

### Are professors public figures? (affects how hard a suit is)

Courts frequently treat faculty as **public officials** (at public universities) or **limited-purpose public figures** as to their teaching and scholarship, which raises the plaintiff's burden to the demanding **"actual malice"** standard (knowledge of falsity or reckless disregard). But this is **not uniform** — some courts treat a run-of-the-mill instructor as a **private figure**, in which case the lower **negligence** standard applies. *Martin v. Roy*, 54 Mass. App. Ct. 642 (2002) found a professor a public figure where he had injected himself into public controversy. (Sources: [Holland & Knight, "Words Like Swords"](https://www.hklaw.com/en/insights/publications/2002/09/words-like-swords-defamation-claims-at-colleges-an); NACUA, *J. College & University Law* vol. 46, ["Defamation Claims in Higher Education"](https://www.nacua.org/docs/default-source/jcul-articles/volume46/4_defamationclaimshighereducation.pdf).) **Do not rely on public-figure status** — design as if the negligence standard applies (i.e., prioritize truthful, experience-based content).

### 🔴 Alabama-specific hazards a lawyer must weigh

- **Alabama has NO anti-SLAPP statute.** Alabama is one of a minority of states with no law letting a defendant quickly dismiss a meritless speech-suppressing suit and recover fees. (Sources: [RCFP Anti-SLAPP Guide — Alabama](https://www.rcfp.org/anti-slapp-guide/alabama/); [Institute for Free Speech — Alabama](https://www.ifs.org/anti-slapp-states/alabama/).) **Consequence:** even a losing defamation suit against the site or a reviewer would have to be fought on the merits, with no fast off-ramp and generally no fee-shifting. This raises the cost of *being sued* regardless of who wins, and is the strongest argument for (a) rigorous content guidelines that keep reviews on the opinion side, and (b) media-liability insurance before launch.
- **Alabama libel retraction statute (Ala. Code § 6-5-186):** punitive damages for libel require proof the publication was made with knowledge of falsity or reckless disregard **and** that the plaintiff made a written demand for retraction at least 5 days before suit that the defendant refused. (Source: [Justia, Ala. Code § 6-5-186](https://law.justia.com/codes/alabama/title-6/chapter-5/article-11/section-6-5-186/).) **Consequence:** a prompt, documented takedown/retraction process is not just good practice — it can cap the site's punitive-damages exposure. Build the takedown flow to log demands and responses.

---

## 3. Anonymous speech and unmasking — and the data-retention posture

### The right and the standards

Anonymous speech is protected by the First Amendment (*McIntyre v. Ohio Elections Commission*, 514 U.S. 334 (1995)). But anonymity yields to a proper showing in a real defamation case. Two leading standards a court may apply before ordering a platform to unmask a poster:

- **Dendrite Int'l v. Doe No. 3, 342 N.J. Super. 134 (App. Div. 2001):** the plaintiff must (1) **notify** the anonymous poster (e.g., via the site) so they can defend; (2) identify the **exact** allegedly actionable statements; (3) plead a **prima facie** cause of action; (4) produce **evidence** supporting each element; and (5) the court **balances** the First Amendment interest against the strength of the case. (Source: [DMLP, Dendrite International v. Does](https://www.dmlp.org/threats/dendrite-international-v-does).)
- **Doe v. Cahill, 884 A.2d 451 (Del. 2005):** requires the plaintiff to produce evidence sufficient to **survive a motion for summary judgment** before unmasking — a demanding bar.

Many states have adopted Dendrite, Cahill, or a hybrid. (Source: [RCFP, Unmasking the identities of online commenters](https://www.rcfp.org/journals/the-news-media-and-the-law-fall-2009/unmasking-identities-online-c/).)

**🔴 Alabama has no clearly adopted appellate standard** for unmasking anonymous online speakers that public sources identify, and the 11th Circuit has no controlling test. This is a genuine gap: an Alabama trial court could apply a weaker or stronger test. **A lawyer must advise** on the realistic unmasking bar in Alabama, and on how the site should respond to a subpoena (notify the user, consider moving to quash, do not auto-comply).

### The verification tension, and why retention is the real control

PlainsCourses verifies each reviewer via an `@auburn.edu` email so reviews are trustworthy but display anonymously. That verification link is exactly what a professor's subpoena would target. **The site can only be compelled to produce what it still holds.** So retention design *is* the anonymity policy.

Note the routes that bypass the defamation-unmasking standards entirely:
- **DMCA § 512(h) subpoena (17 U.S.C. § 512(h))** lets a copyright owner get a clerk-issued subpoena for an alleged infringer's identity **with no lawsuit required** — just a takedown notice, a proposed subpoena, and a sworn declaration. In *Berkovitz v. Doe* (Chapman U., 2022) a professor used this to obtain students' names/emails from Course Hero in weeks. (Source: [Cornell LII, 17 U.S.C. § 512](https://www.law.cornell.edu/uscode/text/17/512); [The Panther, Chapman v. Press](https://www.thepanthernewspaper.org/chapman-university-v-press/l9fzv42ezxaxhse0u95lu0ylvge9z1-hcmnp).) **Lesson:** do not host copyrightable materials (exams, slides, PDFs) — that opens a low-friction identity-compulsion path the defamation standards don't gate. Reviews-only content sidesteps it.
- Grand-jury / criminal subpoenas face fewer First Amendment hurdles than civil ones.

### Concrete data-minimization posture (design requirements)

1. **Separate identity from content at the database level.** Verify the `@auburn.edu` address, then **do not store the email address alongside the review.** Store, at most, a one-way salted **hash** of the address solely to enforce one-account-per-student and block bans — a hash cannot be reversed into an email to hand over.
2. **Do not store the plaintext email after verification.** If a magic-link/OTP flow is used, discard the address once the account exists. What you never stored cannot be subpoenaed.
3. **Purge IP addresses and request logs fast.** Keep them only as long as needed for abuse/rate-limiting (e.g. 7–30 days), then delete. Long web-server/analytics logs are a subpoena target.
4. **Don't log author identity into moderation records.** Moderator notes should reference the review ID, not a person.
5. **Publish the retention policy** so it is a documented, routine practice (not spoliation) and so users understand the protection. **🔴 Confirm with counsel** that the specific retention schedule doesn't conflict with any evidence-preservation duty once the site is on notice of a specific dispute (a litigation hold pauses routine deletion for the affected record).
6. **Subpoena-response protocol:** on any subpoena, notify the affected user promptly (so they can move to quash), and have counsel review before producing anything.

**Net effect:** if the site verifies eligibility but architecturally cannot reconnect a published review to a specific email, the most it can be forced to reveal is "a verified Auburn student wrote this," which is often all it *has*.

---

## 4. University trademark — naming, domain, logo, and copy

### What Auburn actually owns

Auburn University maintains an active **Trademark Management & Licensing** office ([licensing.auburn.edu](https://licensing.auburn.edu/faq/)). Registered marks include **WAR EAGLE®, WAR DAMN EAGLE®, WAR DAMN®, WEAGLE WEAGLE®**, and logo marks (AU Design Mark, Tiger Eyes, Tiger, Eagle-A). "Auburn"/"Auburn University" and the interlocking AU are protected. (Sources: [Auburn Licensing FAQ](https://licensing.auburn.edu/faq/); [USPTO registrations, uspto.report/company/Auburn-University](https://uspto.report/company/Auburn-University).) Licensing is administered through Auburn's agent (historically CLC) across ~500 licensees.

Auburn's policy: for **commercial** use of its marks "the company or individual must be licensed," but *"if you are making an item yourself that will not be sold or used for commercial purposes, you do not need a license."* (Source: [Auburn Licensing FAQ](https://licensing.auburn.edu/faq/).) The FAQ addresses merchandise/apparel/crafters and does **not** publish a specific rule on domain names or website names — a gap that favors caution.

### The two different legal questions

1. **Using Auburn marks in the site's own name / domain / logo (source-identifying use).** *This is the risk.* It can suggest sponsorship or endorsement, and university trademark holders do send cease-and-desist letters and pursue UDRP domain disputes over exactly this. Trademark is also **carved out of § 230** (§ 230(e)(2)), so the immunity above does **not** shield a trademark problem.
2. **Referring to Auburn descriptively in body copy** ("independent reviews of Auburn University courses," "COMP/SWEN courses at Auburn"). *This is much safer* under **nominative fair use** — *New Kids on the Block v. News America Publishing*, 971 F.2d 302 (9th Cir. 1992): use is permissible if (a) the thing isn't readily identifiable without the mark, (b) only as much of the mark as necessary is used, and (c) nothing suggests sponsorship or endorsement. Naming the university you review is the textbook example of necessary descriptive use. (Source: [New Kids v. News America, 971 F.2d 302](https://briefs.lsd.law/new-kids-on-the-block-v-news-america-publishing-inc-971-f-2d-302-1992).)

### How comparable sites handle it — and the endorsement signal

- **PolyRatings** (Cal Poly) uses a name evoking "Poly" but Cal Poly publicly states it "is not affiliated with Polyratings and has no ability to control the site or its content." (Source: [The College Fix](https://www.thecollegefix.com/college-republicans-faculty-advisor-smeared-in-racially-charged-student-review/).)
- **Bruinwalk** is the *opposite* model — it *is* run by UCLA Student Media ("Bruinwalk is a service provided by UCLA Student Media"), so it uses UCLA identity by right. (Source: [bruinwalk.com](https://www.bruinwalk.com/).) PlainsCourses is independent, so it must look like PolyRatings, not Bruinwalk.
- **OMSCentral / uiucmcs.org / MSCSHub** use program-descriptive names, not the university's marks/logos, and carry standard ToS/Privacy pages. (Sources: [omscentral.com](https://www.omscentral.com/); [uiuc-mcs/uiuc-mcs terms.md](https://github.com/uiuc-mcs/uiuc-mcs).)

### Recommendation

- **Name/domain: `plainscourses.com` (or similar) — no Auburn mark in the name, domain, logo, colors, or trade dress.** "Plains" evokes "the Plains" (a nickname for Auburn) without using a registered mark; still, **🔴 have counsel clear the final name** — the *nickname* "The Plains" and "Loveliest Village" could themselves be claimed, and clearance is cheap relative to a rebrand.
- **Do NOT** use the interlocking AU, "War Eagle," Aubie, or Auburn's navy/orange trade dress in the logo or theme. Pick a distinct palette.
- **Describe** the university in copy nominatively and neutrally, and pair every such reference with the disclaimer below.
- Register the DMCA agent (below) partly because trademark/copyright complaints will arrive and a clean notice-and-takedown channel de-escalates them.

### Required unaffiliated-disclaimer language (put in footer of every page + About + ToS)

> *PlainsCourses is an independent, student-run website. It is not affiliated with, endorsed by, sponsored by, or connected to Auburn University or any of its departments. "Auburn University," "Auburn," "War Eagle," and related marks are trademarks of Auburn University, used here only to identify the institution whose courses are reviewed. All reviews are the opinions of individual contributors and do not represent the views of Auburn University or of PlainsCourses.*

---

## 5. Auburn University policy — constraints on the student operator

Auburn's policies bind the **student personally** (via the Code of Student Conduct / Student Policy eHandbook and IT Appropriate/Acceptable Use policies), even though they cannot bind an independent website. The controlling design principle: **keep the site completely off university infrastructure and identity.**

- **Keep it off university IT resources.** Do not host on Auburn servers, do not use AU Access/Banner credentials, and do not build on university-provided compute/storage. Appropriate-use policies restrict university IT resources to university purposes; an independent commercial/quasi-commercial site should live entirely on third-party hosting under the student's own accounts.
- **The `@auburn.edu` address is used only as an eligibility signal**, verified through normal email — the site should not access Auburn mail systems, directories, or authenticate against university SSO. (Verifying that a person controls an `@auburn.edu` inbox via a magic link is ordinary email verification, not access to university systems.)
- **Do not imply university affiliation or misuse the university name/identity** — this is both a trademark issue (§4) and potentially a student-conduct issue (misrepresentation of affiliation). The disclaimer and clean branding cover this.
- **Course-catalog data sourcing.** Prefer the public course **Bulletin** and publicly published schedule data; do **not** scrape behind authentication (Banner/AU Access) or in violation of a site's terms, and do not republish copyrighted catalog *prose* wholesale (facts like course numbers, titles, credit hours, and prereqs are not copyrightable, but expressive descriptions may be). **🔴 A lawyer/administrator should confirm** the acceptable sourcing method and whether any Auburn terms restrict automated access.
- **Note (gap):** the exact IT Appropriate-Use policy sections and the Student Code sections on off-campus/online conduct and misrepresentation are **not individually quoted here with section numbers** — this research verified the policy *locations* but not each operative clause. Auburn publishes its policies through the [Office of the General Counsel policy library (auburn.edu/policies)](https://auburn.edu/policies), the [Student Policy eHandbook](https://www.auburn.edu/student_info/student_policies/), and the [Code of Student Conduct](https://studentaffairs.auburn.edu/acsc/policies-processes/code-of-student-conduct/index.php). **🔴 Before launch, read and cite the current Appropriate Use Policy and the relevant Code of Student Conduct sections from those sources** and confirm nothing in them reaches an independent, off-infrastructure site. Do not rely on this bullet as a clearance.

---

## 6. Practical mitigations — the concrete playbook

### Terms of Service (must include)

- **Eligibility & one-account rule:** users represent they are/were Auburn students verified via `@auburn.edu`.
- **User content license:** a non-exclusive, royalty-free, worldwide license for the site to host, display, reproduce, moderate, and aggregate submitted reviews (so the site can operate and compute aggregates) — narrower than RMP's perpetual "throughout the universe" grant, which is a defensible model but broader than needed. (Model reference: [RMP Terms of Use](https://www.ratemyprofessors.com/terms-of-use).)
- **User representations & warranties:** the reviewer warrants the content is their own honest first-hand experience, is not knowingly false, is not defamatory/harassing/infringing, and reveals no confidential/private info.
- **Prohibited content** (mirrors the review guidelines below).
- **Indemnification:** the user indemnifies the site for claims arising from their content (standard; RMP and others use this).
- **Disclaimer of warranties / "AS IS" / limitation of liability:** the site does not verify and does not endorse reviews and is not liable for them. (Model: [uiucmcs.org terms.md](https://github.com/uiuc-mcs/uiuc-mcs) uses standard "AS IS," limitation-of-liability, and "reviews do not reflect our views" language.)
- **Non-endorsement statement:** "Reviews are the opinions of individual contributors and are not verified or endorsed by PlainsCourses." (RMP's exact posture: "Postings do not reflect the views of Rate My Professors and Rate My Professors does not represent or guarantee the truthfulness, accuracy or reliability of any Posting.")
- **Auburn non-affiliation disclaimer** (§4 language).
- **Takedown/removal rights:** the site may remove any content at its discretion, in good faith (this both improves quality and sits squarely inside § 230(c)(2)).
- **Governing law / dispute resolution:** **🔴 counsel should choose** governing law and whether to include an arbitration/class-action-waiver clause (RMP uses JAMS arbitration + class waiver with a 45-day opt-out; that's a heavier apparatus than a solo student site may want).
- **Age:** require 18+ (as uiucmcs.org does) to avoid minors' data complications.

### Review guidelines (must PROHIBIT — mirrors what RMP removes)

Model directly on the published [RateMyProfessors Guidelines](https://www.ratemyprofessors.com/guidelines), which remove content containing:

- **Protected-characteristic remarks:** "profanity, name-calling… derogatory remarks about religion, ethnicity or race, gender, physical appearance, age, mental and/or physical disabilities." **Prohibit all commentary on a professor's appearance, dress, age, gender, race, religion, disability, or sexuality** — these add nothing to workload signal and are the fastest route to a hostile-environment / harassment complaint (cf. the PolyRatings/Kennelly racist-review incident, which is exactly the failure mode to design out).
- **Allegations of illegal activity / specific factual accusations of misconduct** — the highest defamation-risk category. Prohibit accusing a named professor of crimes, cheating, discrimination-as-fact, or other provable-false conduct. Steer reviewers toward experience and opinion ("the workload felt unmanageable"; "exams didn't seem carefully graded") rather than factual charges ("he doesn't grade exams," "she's a racist").
- **Identifying/contact information** about professors or students; **references to personal, family, or sexual matters.**
- **Impersonation / self-reviews / reviews by the professor.**
- **Off-topic spam, links/URLs, and content on the wrong course/professor.**
- Require reviews to be **based on the reviewer's own experience in the course.**

Present the guidelines *at the point of submission* (not just buried in ToS), and keep the on-screen prompts neutral (§1) so the site never authors the accusatory content.

### Takedown / reporting process (must exist and be documented)

- **"Report this review" button** on every review (RMP model), routing to a moderation queue with a defined response target (e.g., review within 48–72 hours).
- A **published removal/complaint email** (e.g., `moderation@` and a separate `legal@`/DMCA agent) and a simple web form for professors/third parties to flag content.
- **Written policy that on-topic negative reviews are not removed just for being negative**, but guideline-violating content is (RMP's stated posture: "We are unable to remove a comment simply because it is negative"). This is both principled and protective — consistent good-faith moderation supports § 230(c)(2).
- **Log every complaint, demand, and action** (with timestamps) against the review ID. This documentation (a) supports the Alabama retraction-statute posture (§2), (b) evidences good-faith moderation, and (c) creates an audit trail if litigation follows.
- **Register a DMCA agent with the U.S. Copyright Office** and publish the agent's contact info, to get the § 512(c) safe harbor for any user-posted material and a clean channel for copyright complaints. Registration is required (publication on-site **plus** filing with the Copyright Office) and **expires/must be renewed every 3 years.** (Source: [Copyright Office, § 512 / DMCA Designated Agent Directory](https://www.copyright.gov/512/).)

### Data retention (must minimize) — see §3 for the full posture

Store a **salted hash** of the verifying email (not the address); purge plaintext emails post-verification; purge IP/request logs on a short cycle; never bind author identity to published content in a reversible way; publish the retention schedule; notify users of subpoenas before responding.

### Insurance & entity (recommended, **🔴 discuss with counsel**)

Because Alabama has no anti-SLAPP backstop, consider (a) **media/cyber liability insurance** covering defamation defense costs, and (b) operating through an **LLC** rather than personally, to add a liability shield around the individual student operator. Both are risk-transfer decisions a lawyer/insurance broker should size.

---

## 7. Concrete requirements for the spec (checklist)

**Architecture / data model**
- [ ] Verify `@auburn.edu` via email magic-link/OTP; **store only a salted one-way hash** of the address for uniqueness/bans — never the plaintext, never alongside the review.
- [ ] Publish reviews with **no reversible link** to author identity in the content store.
- [ ] **Purge IP addresses and request logs** on a short schedule (target 7–30 days); keep only for rate-limiting/abuse.
- [ ] Moderation records key off **review ID**, not person.
- [ ] Aggregate scores are **computed from user-submitted numbers** (a neutral tool) — no site-authored claims about individuals.
- [ ] **No hosting of copyrightable course materials** (exams, slides, PDFs) — reviews only, to avoid the DMCA § 512(h) unmasking route.
- [ ] Host entirely on **third-party infrastructure under the operator's own accounts**; touch **no** Auburn IT systems, SSO, Banner, or directories.

**Content design (keeps § 230 intact + reduces defamation)**
- [ ] Every site-supplied **prompt, dropdown, and option is neutral and non-accusatory**; all substantive claims about a person come only from user free-text.
- [ ] Structured fields: hours/week, difficulty, grade, term, instructor picker — descriptive, not accusatory.
- [ ] Editing limited to typos/length/format; **never alter meaning**; never append site-authored commentary to a person's page.

**Legal pages & disclaimers**
- [ ] **Terms of Service** with: eligibility, narrow content license, user warranties, prohibited content, indemnification, AS-IS/limitation-of-liability, non-endorsement, Auburn non-affiliation disclaimer, discretionary-removal right, 18+ requirement, governing-law/dispute clause (**🔴 counsel to finalize**).
- [ ] **Privacy Policy** stating what is collected, the retention/deletion schedule, and the subpoena-notification practice.
- [ ] **Review Guidelines** shown *at submission*, prohibiting: protected-characteristic commentary, appearance/personal remarks, allegations of illegal activity / specific false-fact accusations, identifying info, impersonation/self-reviews, spam/links, wrong-professor content; require first-hand experience.
- [ ] **Unaffiliated-disclaimer** (§4 language) in the **footer of every page**, About, and ToS. No Auburn marks/logo/trade dress in name, domain, or theme.

**Operations**
- [ ] **"Report this review"** on every review → moderation queue with a stated response target.
- [ ] Published **`moderation@` / `legal@`** contacts and a complaint web form.
- [ ] Written policy: on-topic negatives stay; guideline violations go; **log every demand and action** by review ID and timestamp.
- [ ] **DMCA agent registered** with the Copyright Office (renew every 3 years) and published on-site.
- [ ] **Subpoena protocol:** notify the affected user, route to counsel, do not auto-comply.

**🔴 LAWYER BEFORE LAUNCH (bounded consult with an Alabama First-Amendment/internet attorney)**
- [ ] **Clear the final name and domain** against Auburn's marks (including nickname marks like "The Plains" / "Loveliest Village").
- [ ] **Review ToS, Privacy Policy, and Review Guidelines**; finalize governing-law and any arbitration clause.
- [ ] Advise on the **Alabama unmasking standard** and subpoena-response strategy (no clear public precedent).
- [ ] Confirm the **retention schedule vs. litigation-hold/spoliation** duties.
- [ ] Read and confirm current Auburn **Appropriate Use Policy** ([auburn.edu/policies](https://auburn.edu/policies)) and **Code of Student Conduct** ([studentaffairs.auburn.edu](https://studentaffairs.auburn.edu/acsc/policies-processes/code-of-student-conduct/index.php)) sections don't reach an off-infrastructure independent site; confirm acceptable **course-data sourcing**.
- [ ] Advise on **media/cyber-liability insurance** and whether to operate through an **LLC** (Alabama has **no anti-SLAPP** statute — being sued is costly even when you win).

---

## Sources

Primary law: [47 U.S.C. § 230 (Cornell LII)](https://www.law.cornell.edu/uscode/text/47/230) · [17 U.S.C. § 512 (Cornell LII)](https://www.law.cornell.edu/uscode/text/17/512) · [Ala. Code § 6-5-186 (Justia)](https://law.justia.com/codes/alabama/title-6/chapter-5/article-11/section-6-5-186/) · [Alabama Data Breach Notification Act, Ala. Code tit. 8 ch. 38 (Justia)](https://law.justia.com/codes/alabama/title-8/chapter-38/).

Government / authoritative analysis: [CRS In Focus IF12584, *Section 230: A Brief Overview* (Feb. 2, 2024)](https://crsreports.congress.gov) · [U.S. Copyright Office, Section 512 / DMCA Designated Agent](https://www.copyright.gov/512/).

Cases (verify current status with counsel): *Zeran v. AOL*, 129 F.3d 327 (4th Cir. 1997) · *Fair Housing Council v. Roommates.com*, 521 F.3d 1157 (9th Cir. 2008) · *Jones v. Dirty World*, 755 F.3d 398 (6th Cir. 2014) · *Milkovich v. Lorain Journal*, 497 U.S. 1 (1990) · [*McKee v. Laurion*, 825 N.W.2d 725 (Minn. 2013)](https://law.justia.com/cases/minnesota/supreme-court/2013/a11-1154.html) · [*ZL Technologies v. Doe*, 13 Cal.App.5th 603 (2017)](https://law.justia.com/cases/california/court-of-appeal/2017/a143680.html) · [*Dendrite Int'l v. Doe No. 3*, 342 N.J. Super. 134 (2001)](https://www.dmlp.org/threats/dendrite-international-v-does) · *Doe v. Cahill*, 884 A.2d 451 (Del. 2005) · *McIntyre v. Ohio Elections Comm'n*, 514 U.S. 334 (1995) · [*New Kids on the Block v. News America Publishing*, 971 F.2d 302 (9th Cir. 1992)](https://briefs.lsd.law/new-kids-on-the-block-v-news-america-publishing-inc-971-f-2d-302-1992) · [*Martin v. Roy*, 54 Mass. App. Ct. 642 (2002) (via Holland & Knight)](https://www.hklaw.com/en/insights/publications/2002/09/words-like-swords-defamation-claims-at-colleges-an) · [*Berkovitz v. Doe* (Chapman U., 2022)](https://www.thepanthernewspaper.org/chapman-university-v-press/l9fzv42ezxaxhse0u95lu0ylvge9z1-hcmnp) · [*Vogl-Bauer v. Llewellyn* (Inside Higher Ed)](https://www.insidehighered.com/news/2014/05/23/professor-sues-student-over-online-reviews-her-course).

Guidance & policy: [EFF — Section 230](https://www.eff.org/issues/bloggers/legal/liability/230) · [EFF — Defamation](https://www.eff.org/issues/bloggers/legal/liability/defamation) · [DMLP — Opinion & Fair Comment](http://www.dmlp.org/legal-guide/opinion-and-fair-comment-privileges) · [RCFP — Anti-SLAPP Alabama](https://www.rcfp.org/anti-slapp-guide/alabama/) · [Institute for Free Speech — Alabama](https://www.ifs.org/anti-slapp-states/alabama/) · [RCFP — Unmasking online commenters](https://www.rcfp.org/journals/the-news-media-and-the-law-fall-2009/unmasking-identities-online-c/) · [NACUA J. Coll. & Univ. Law — Defamation in Higher Ed](https://www.nacua.org/docs/default-source/jcul-articles/volume46/4_defamationclaimshighereducation.pdf).

Trademark: [Auburn Trademark Management & Licensing FAQ](https://licensing.auburn.edu/faq/) · [USPTO registrations — Auburn University](https://uspto.report/company/Auburn-University).

Comparable sites: [RateMyProfessors Guidelines](https://www.ratemyprofessors.com/guidelines) · [RateMyProfessors Terms of Use](https://www.ratemyprofessors.com/terms-of-use) · [PolyRatings/Cal Poly non-affiliation (The College Fix)](https://www.thecollegefix.com/college-republicans-faculty-advisor-smeared-in-racially-charged-student-review/) · [Bruinwalk (UCLA Student Media)](https://www.bruinwalk.com/) · [omscentral.com](https://www.omscentral.com/) · [uiuc-mcs/uiuc-mcs ToS & Privacy](https://github.com/uiuc-mcs/uiuc-mcs).
