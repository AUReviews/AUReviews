# Verifying @auburn.edu addresses: mechanics, auth providers, and anonymity architecture

Research resolving issue [#5](https://github.com/PlainsCourses/PlainsCourses/issues/5). Scope: how to actually build "verify an @auburn.edu email, then publish the review anonymously" in a Next.js/TypeScript app run by a solo student with no budget.

Every non-obvious claim is cited. Where a primary source could not be read directly (Auburn's IT portal renders via JavaScript and is not fetchable as static HTML), the claim is marked **[uncertain — confirm]** and the reason given.

---

## 1. Auburn's email reality

### Address format

- Auburn's canonical student/employee address is `username@auburn.edu`. The Engineering help desk states plainly: "Your default return address is *username@auburn.edu*." ([eng.auburn.edu — Your E-mail Addresses](https://www.eng.auburn.edu/ens/helpdesk/e-mail/your-email-addresses.html))
- The `username` for current accounts is an opaque ID, not a human name. Multiple Auburn-adjacent sources describe the modern format as first-initial + middle-initial + last-initial + a 4-digit number (e.g. `abc1234`), with an older legacy format of (first five letters of last name)(first initial)(middle initial). ([Auburn OIT via search summary](https://bulletin.auburn.edu/generalinformation/informationtechnology/); format not quotable from a single fetchable primary page — **[uncertain on exact digit count — confirm against a live OIT account page]**). The practical consequence matters more than the exact scheme: **the address space is small and enumerable.** Three letters + four digits is ~1.75 x 10^8 candidates, and the real occupied set is far smaller. This directly shapes the anonymity design in section 4.
- `tigermail.auburn.edu` is the mailbox/login host. Students sign in at `outlook.com/tigermail.auburn.edu` with `username@tigermail.auburn.edu`. ([tigermail.auburn.edu](https://tigermail.auburn.edu/), [Auburn Business & Administration — Email Notification Procedures](https://ba.auburn.edu/email-notification-procedures/)). For our purposes the deliverable/user-facing address is `@auburn.edu`; treat `@tigermail.auburn.edu` as an equivalent that also resolves to the same person.

### Mail provider = Microsoft 365 (Office 365 / Exchange Online)

- Confirmed. Auburn migrated student and departmental mail to Office 365; COSAM documents an "O365 Email Migration" and students use Outlook/Office 365 in the cloud. ([COSAM O365 Email Migration](https://www.auburn.edu/cosam/about/deans-office/it/email_migration.htm), [tigermail.auburn.edu](https://tigermail.auburn.edu/)). This means our verification mail is being filtered by **Exchange Online Protection (EOP) / Microsoft Defender for Office 365** — see section 3.

### Aliases — the account-farming vector

- **Auburn students can request an email alias.** "You can request an alias for your @auburn.edu address at the following OIT website (click on the E-mail Alias Request link)." ([eng.auburn.edu — Your E-mail Addresses](https://www.eng.auburn.edu/ens/helpdesk/e-mail/your-email-addresses.html))
- Implication: **one person can hold more than one deliverable `@auburn.edu` string** (the opaque `username@auburn.edu` plus a human-readable alias such as `jane.doe@auburn.edu`, plus `@tigermail.auburn.edu`). All deliver to the same mailbox, but to our app they are *different strings*. Naive "one address = one person" dedup is therefore defeatable by a motivated user who requests an alias. This is not a mass-farming hole (getting a second alias is friction, tied to one real account), but it does mean the abuse floor is "a handful of identities per real student," not "one." Rate limits and per-course dedup (section 5) must assume this.

### Alumni retention

- Auburn maintains **alumni/retiree email**: there is a dedicated IT knowledge-base article, "Microsoft Multi-Factor Authentication (MFA) Overview: Alumni and Retiree Email" (KB0011897), and a KB "Email after Graduation or Retirement" (KB0012546). The existence of an alumni-email MFA procedure is strong evidence that **graduates keep a working Auburn mailbox.** ([Auburn IT Service Portal search results listing KB0011897 and KB0012546](https://auburn.service-now.com/it?id=kb_article_view&sysparm_article=KB0012546))
- **[uncertain — confirm]**: the exact grace period, whether the address changes on transition to alumni status, and any long-term deletion policy. The Auburn IT portal (`auburn.service-now.com`) is a JavaScript SPA and its article bodies could not be fetched as static text; the article *titles* are visible in search but the *terms* are not. Product decision this feeds: **if alumni retain a working address, alumni can and will review** — good for cold-start review volume, but it widens the eligible population and means "is a current student" is not something we can assert, only "has/had an Auburn mailbox." Design the copy and data model to say "verified Auburn affiliate," not "current student."

---

## 2. Auth options for Next.js

Scale assumption: a CSSE-only launch is low thousands of users at most, likely low hundreds in year one. All four options are financially free at this scale; the real differentiators are **domain-restriction effort**, **ability to decouple the verified address from the published review**, and **lock-in**.

### Auth.js / NextAuth (self-hosted, open source)

- Free and open source (MIT), self-hosted; no per-user fee ever. ([authjs.dev](https://authjs.dev/getting-started/authentication/email))
- Magic-link ("Email provider") flow is built in: user submits email, a verification token is stored in your DB, link is valid 24h. "A database is required for passwordless login to work as verification tokens need to be stored." Email delivery is pluggable — Nodemailer/SMTP, Resend, Postmark, etc. ([Auth.js Email provider](https://authjs.dev/getting-started/authentication/email))
- **Domain restriction is trivial and first-party documented.** The official "Restricting User Access" guide gives exactly this:
  ```ts
  callbacks: { signIn({ profile }) { return profile.email.endsWith("@auburn.edu") } }
  ```
  Returning `false` rejects the sign-in. ([Auth.js — Restricting User Access](https://authjs.dev/guides/restricting-user-access)). You'd also normalize case and accept `@tigermail.auburn.edu`.
- **Decoupling the address from content: full control**, because you own the schema. You can store the verified identity in one place and the review in another, or store only a hash/credential (section 4). No provider dictates your `users` table.
- **Lock-in: lowest.** It's your database and your code. Switching email vendors is a config change.
- Cost: your time. You implement the token table, rate limiting, and email templates (though Auth.js scaffolds most of this).

### Hand-rolled magic link

- Mechanically identical to Auth.js's email provider but without the library: generate a single-use, expiring, high-entropy token, store its hash, email the link, verify on click. Everything Auth.js gives you (token storage, 24h expiry, DB requirement) you now build and must get right (constant-time compare, single-use invalidation, rate limiting).
- **Domain restriction / decoupling / lock-in: identical to Auth.js** (you control everything), but with more code to write and more ways to introduce a security bug. There is essentially no upside over Auth.js unless you want zero dependencies. Treat this as "Auth.js without the seatbelts."

### Clerk (hosted)

- Free "Hobby/Free" plan: **10,000 monthly active users** historically; the current pricing page describes a large free allotment (the page now frames it as up to 50,000 "monthly retained users" — a retained user is one who "return[s] to your app at least 24 hours after signing up") before per-user overage (~$0.02/user/mo in the first paid band). ([clerk.com/pricing](https://clerk.com/pricing)). At our scale this is free.
- **Domain restriction exists but is gated to paid for production.** Clerk's Restrictions → Allowlist lets you allow only `auburn.edu`: "only users with those identifiers will be able to sign up... while others will be blocked," and users can't later change email to bypass it. But "all features are free to use in development mode"; **the allowlist requires a paid plan in production.** ([Clerk — Restrictions docs](https://clerk.com/docs/authentication/configuration/restrictions)). You can work around this by validating the domain in your own webhook/`beforeSignUp` logic, but then you're re-implementing the very thing you adopted Clerk to avoid.
- **Decoupling: weaker.** Clerk *is* the identity store — the verified email lives in Clerk's system by design, keyed to a Clerk user ID you then reference. You can keep the review row keyed only to an opaque Clerk `userId`, but the address-to-user mapping now lives on a third party's servers (a subpoena target you don't control, and a second custodian of PII). See section 4.
- **Lock-in: high.** Users, sessions, and the identity model live in Clerk; migrating out means exporting users and rebuilding auth.

### Supabase Auth (hosted, open-source core)

- Free tier: **50,000 monthly active users**; no auth overage on free. Caveat that matters for a low-traffic launch: **"Free projects are paused after 1 week of inactivity."** ([supabase.com/pricing](https://supabase.com/pricing)). A paused project means the site is down until you unpause — real risk for a review site with sporadic traffic between registration weeks. Mitigate with a keep-alive cron or accept the risk.
- **Domain restriction: no dashboard toggle; you write a hook or trigger.** The modern path is the **Before User Created hook** — a function that runs immediately before the user row is inserted and can reject the signup (e.g. require `@auburn.edu`, block disposable domains). Alternatively a Postgres trigger on `auth.users`. ([Supabase — Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook), [GitHub discussion #5088](https://github.com/orgs/supabase/discussions/5088)). More work than Auth.js's one-liner, less than nothing.
- **Decoupling: good, and convenient** — if you're already using Supabase Postgres for the app, `auth.users` and your `reviews` table are in the same DB, so you can enforce constraints (one review per course per user) in SQL while still keeping the review row pointed at an opaque user UUID, never the address. But the address sits in `auth.users.email` in the same database as the content, so "same custodian" concerns apply unless you delete/hash it (section 4).
- **Lock-in: medium.** Auth is GoTrue (open source, self-hostable), and it's Postgres underneath, so you can leave — but the managed convenience is what you'd be giving up.

### Verdict on auth

| | Free at our scale | Domain restrict | Decouple address from content | Lock-in |
|---|---|---|---|---|
| **Auth.js** | Yes (free forever) | One-line `signIn` callback, first-party | Full control | Lowest |
| Hand-rolled | Yes | You write it | Full control | Lowest (but most code/risk) |
| Clerk | Yes | Allowlist, **paid in prod** | Weak (Clerk owns identity) | High |
| Supabase Auth | Yes* (*pauses when idle) | Before-User-Created hook | Good, same-DB | Medium |

---

## 3. Transactional email delivery

The verification email is the single point of failure in the funnel: if the magic link lands in an Auburn student's Junk/Quarantine, the user never verifies. We are sending *into a Microsoft 365 tenant*, so Microsoft's filters (EOP/Defender) are the gatekeeper.

### What Microsoft actually does (this is the load-bearing constraint)

Per Microsoft's own docs, inbound mail to M365 is scored by **implicit / composite authentication** that combines SPF, DKIM, and DMARC **plus sender reputation, sender history, recipient history, and behavioral analysis.** A brand-new sending domain has *no reputation and no history*, which is the weakest possible starting position. ([Microsoft Learn — How email authentication works in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about))

Two quotes that define our risk:
- A composite-auth failure "doesn't directly result in a message being blocked... a holistic evaluation strategy" is used — so we're not doomed if reputation is thin, but we're at the filter's discretion.
- "Delivery to Microsoft isn't guaranteed, even if you authenticate email... But email authentication ensures that Microsoft doesn't automatically junk email... simply because it isn't authenticated."

Translation: **SPF + DKIM + DMARC on our own sending domain is mandatory just to not be auto-junked**, and even then early deliverability depends on reputation we have to earn. Practical mitigations: send from a dedicated subdomain (e.g. `mail.plainscourses.com`) to isolate reputation; keep volume low and content plain (a magic link, no marketing); warm gradually; and consider a "check your Junk folder" line plus a resend button in the UI as a funnel backstop. ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about); corroborating deliverability guidance: [Mailgun — Outlook sender requirements](https://www.mailgun.com/blog/deliverability/microsoft-sender-requirements/))

### DNS setup required (same for any provider)

On `plainscourses.com` (or the sending subdomain) you publish, using records the provider generates for you:
- **SPF** — TXT record authorizing the provider's servers (`v=spf1 include:<provider> ~all`).
- **DKIM** — CNAME/TXT record(s) publishing the provider's signing key so mail is cryptographically signed.
- **DMARC** — TXT record at `_dmarc` telling receivers what to do on failure and where to send reports; start at `p=none` to monitor, tighten to `quarantine`/`reject` once aligned. ([Microsoft Learn — email authentication](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about))
Microsoft additionally weighs **identity alignment** — the From domain, DKIM `d=` domain, and Return-Path should cohere, so let the provider handle Return-Path on your subdomain. ([Mailgun — Outlook sender requirements](https://www.mailgun.com/blog/deliverability/microsoft-sender-requirements/))

### The providers

| Provider | Free tier | Cheapest paid | Deliverability posture | Notes |
|---|---|---|---|---|
| **Resend** | **3,000 emails/mo, capped 100/day**, 1 domain | Pro **$20/mo → 50,000/mo** | DKIM/SPF/DMARC setup is guided; developer-first, native Auth.js integration | 100/day is plenty for our verification volume; DX is the best of the three ([resend.com/pricing](https://resend.com/pricing)) |
| **Postmark** | **100 test emails/mo** (integration testing only), no expiry | Basic **$15/mo → 10,000/mo**, then $1.80/1,000 | Reputation is Postmark's headline selling point; strict about transactional-only use | Free tier is a *trial*, not a production allowance — you must pay $15 to go live ([postmarkapp.com/pricing](https://postmarkapp.com/pricing)) |
| **AWS SES** | No standing free monthly tier anymore; new accounts get up to **$200 in credits for ~6 months**. À-la-carte ~**$0.10/1,000** outbound | pay-as-you-go, effectively ~$0.10/1,000 | Cheapest at volume, but you own more of the deliverability/warm-up work and setup is fiddlier | The old "62,000 free/mo from EC2" is not reflected on the current pricing page — **treat 62k-free as gone / [uncertain]**; verify at send time ([aws.amazon.com/ses/pricing](https://aws.amazon.com/ses/pricing/)) |

**Recommendation: Resend.** Its free tier (3,000/mo, 100/day) covers our entire verification volume at zero cost, the DNS/DKIM setup is guided, and it has a first-party Auth.js email provider so wiring it in is trivial. Postmark has a marginally stronger deliverability reputation but costs $15/mo to run in production. SES is cheapest at scale we won't reach and adds operational burden. Runner-up: **Postmark**, if early deliverability into Auburn's tenant proves painful and the $15/mo buys peace of mind.

---

## 4. Anonymity architecture (the part most likely to be gotten wrong)

The goal has three requirements in tension:
1. **Prove** a review came from a verified Auburn affiliate.
2. **Enforce** one review per course per person (and support edit/delete of *your own* review).
3. **Make it hard for anyone — including a subpoena — to map a published review back to an email address.**

The core problem: **an Auburn address is low-entropy and enumerable** (section 1). Any scheme whose secret is stored *in the same database as the data* is reversible by whoever gets the database.

### Option A — Store the email in plaintext, key reviews to a user id (the naive baseline)

- `users(id, email)`; `reviews(id, user_id, course_id, ...)`.
- Enforce one-per-course with a unique constraint on `(user_id, course_id)`. Edit/delete work perfectly (you own the row via `user_id`).
- Anonymity: **display-only.** The public never sees the email, but the linkage is one JOIN away. A database breach, a rogue admin, or a subpoena *"produce the email behind review X"* fully de-anonymizes every review.
- Verdict: simplest, weakest. Acceptable only if you accept that "anonymous" means "anonymous to other users, not to the operator or a court."

### Option B — Salted hash of the email, discard the plaintext

- On verify, compute `H = hash(normalize(email) + salt)`, store `H`, **never store the email.** Key reviews to `H` (or to a user id that maps only to `H`).
- Unique constraint on `(H, course_id)` still enforces one-per-course; the user can edit/delete because they can re-derive `H` by re-verifying (or via a session/cookie holding a token, not the address).
- The trap: **if the salt is stored next to the hash (the normal way salts work), this is barely better than plaintext for a low-entropy input.** An attacker/court with the DB knows the Auburn address format and can brute-force all ~10^8 candidates against each stored `H` in minutes. Salt stops *rainbow tables and cross-record correlation*; it does **not** stop brute force of an enumerable space.

### Option C — Peppered / keyed hash (HMAC with a secret key stored OUTSIDE the DB) — recommended core

- Compute `H = HMAC-SHA256(key, normalize(email))`, where `key` (the "pepper") lives in a **secret manager / environment variable, never in the database.** ([pepper as a separately-stored secret: authgear explainer](https://www.authgear.com/post/password-hashing-salting-function-and-algorithm-explained/), [gopher.security — pepper in hashing](https://www.gopher.security/post-quantum/pepper-password-hashing-algorithms-security))
- Now a DB-only compromise (or a subpoena served on the DB host) yields `H` values that are **not** brute-forceable, because the attacker lacks the key — even though the input space is tiny. HMAC with per-partner/rotated keys is a recognized way to make hashed identifiers non-linkable. ([HMAC-keyed email hashing to prevent linkage: search summary](https://agilebrandguide.com/wiki/data/hashed-email-hem/))
- One-per-course: unique `(H, course_id)`. Edit/delete: the user re-verifies (or holds a session token) → you recompute `H` → you find *their* row. Works.
- **What this buys and what it doesn't** — be honest about the compelled-disclosure interaction (this is where the legal research plugs in):
  - Against a **database breach or a subpoena for "the database"**: strong. The mapping isn't in the data.
  - Against a subpoena/court order for **"the pepper key" or "identify the person behind review X going forward"**: the key is a single point of de-anonymization. If *you* can still map a review to an address (because you hold the key and can hash a suspected address to see if it matches `H`), then **you can be compelled to do exactly that.** HMAC makes bulk/retroactive de-anonymization hard, but *targeted* checking ("is this review from `abc1234@auburn.edu`?") remains possible for anyone holding the key. That is a deliberate, defensible middle ground, but name it as such.
  - Rotating/discarding the key breaks your own ability to enforce one-per-course across the rotation and to service edits — so key rotation is not free.

### Option D — Verify then fully discard (issue a bearer credential, keep no per-user record)

- On successful verification, mint a signed, single-use "post credential" and **store nothing tied to the address at all** — not even `H`. The user posts with the credential; you record only the review.
- Anonymity against subpoena: **strongest** — there is genuinely nothing to map back.
- Cost: **you lose one-per-course enforcement and you lose edit/delete of a specific user's review**, because you kept no stable per-person identifier. A user could verify repeatedly and post many reviews to one course; you can't recognize their prior review to update or remove it. This is usually too lossy for a review site.

### Option E — Blind-signature / zero-knowledge membership (theoretically ideal, over-budget)

- Cryptographic unlinkable credentials (blind signatures, zk proofs of "I hold a valid Auburn credential") let a user prove membership and even prove "one token per course" without revealing which token, breaking the link entirely. ([zk-SNARK anonymous spam-prevention, illustrative](https://arxiv.org/pdf/2103.02061))
- Verdict for a solo student with no budget: **out of scope.** Real implementation complexity, easy to get subtly wrong, no off-the-shelf drop-in for Next.js. Note it exists; don't build it for v1.

### Practical recommendation for anonymity

Use **Option C (HMAC-peppered identity hash) as the persistent identity, with a hard architectural split**:
- **Verification store** holds only `identity_hash = HMAC(pepper, normalized_email)` and a `verified_at` timestamp. No plaintext email is retained past the moment the token is validated. The pepper lives in a secret manager, not the DB.
- **Content store** holds `reviews(id, identity_hash, course_id, instructor, hours, difficulty, body, created_at)` with a **unique index on `(identity_hash, course_id)`**. This is the one seam that must never leak the email, and with Option C it can't be reversed from the DB alone.
- Display strips `identity_hash` entirely from the public payload — reviews render with no per-user handle, or with a per-review random display id if you want threading. Never expose `identity_hash` to the client; it's a low-entropy-input hash and must stay server-side.

This gives you: display anonymity, one-per-course, working edit/delete, resistance to DB breach and to "hand over the database" subpoenas — while being explicit that a court order compelling the *pepper key* plus a *suspected address* can still confirm authorship of a specific review. That residual is the deliberate tradeoff, and it's the exact fact the legal-posture research needs to reason about.

---

## 5. Abuse ceiling and rate limits

**What .edu verification does NOT stop, even done perfectly:**
- **Alias farming (bounded).** A real student can request an alias (section 1), giving them a second/third deliverable address = a second/third `identity_hash` = the ability to post multiple reviews to the same course. Bounded by the friction of requesting aliases, so this is "a few sockpuppets per determined person," not mass astroturfing.
- **Alumni and any current affiliate** can review (section 1). "Verified" means "controls an Auburn mailbox," not "took this course." Nothing about email verification proves enrollment in COMP 3500. A determined actor can review courses they never took.
- **Ballot-stuffing within the population.** Verification gates *who* can post, not *what* they post. A cluster of real students can coordinate to inflate/tank a course or instructor. This is a content/moderation problem, not an auth problem — flag it to the moderation ticket.
- **No stop on defamatory or false content** — again a moderation concern, not solved here.

**Rate limits worth specifying:**
- **Email-send throttle** (protects deliverability reputation *and* blocks enumeration): per-IP and per-address cap on verification-email requests — e.g. ≤3 sends per address per hour, ≤10 per IP per hour, plus a global ceiling well under Resend's 100/day so a spike can't burn the daily quota. (Volume discipline is also what keeps M365 from souring on the sender — section 3.)
- **One verification token live per address at a time**, single-use, 15–60 min expiry (tighter than Auth.js's 24h default if you want less link-sharing exposure).
- **One review per `(identity_hash, course_id)`** enforced in the DB (section 4), so re-verifying can't multiply reviews on a course.
- **Post-verification posting cap** — e.g. a new identity can post at most N reviews in its first hour/day, to blunt a freshly-farmed alias dumping a slate of reviews.
- **CAPTCHA / proof-of-work on the request-email endpoint** if you see automated enumeration attempts.
- Accept explicitly that these raise the cost of abuse; they don't eliminate the alias/alumni ceiling above, which is inherent to email-only verification.

---

## Recommended architecture

**Stack decision:** **Auth.js (NextAuth) email/magic-link provider + Resend for delivery + Postgres you control (Supabase Postgres or Neon).** Runner-up: **Supabase Auth** (its Before-User-Created hook + same-DB constraints are genuinely convenient) — the reason Auth.js edges it is the one-line first-party domain restriction, zero cost forever, lowest lock-in, and full control over the identity/hash schema that the anonymity design depends on. Clerk is ruled out for v1 because its domain allowlist is paid-in-production and it makes the operator hold a second custodian of the email→user map. Runner-up email provider: **Postmark**, if deliverability into Auburn's M365 tenant proves painful.

Why not just hand-roll the magic link: Auth.js gives you the same control with token storage, expiry, and the `signIn` domain check already solved — less code, fewer security footguns, same lock-in profile.

### Concrete data flow — what is stored where at each step

Secrets: `PEPPER` (HMAC key) lives in the host's secret manager / env, **never in the database**. `RESEND_API_KEY` likewise.

1. **User submits address** on the site → server checks the domain **before doing anything**: reject unless `normalize(email)` ends in `@auburn.edu` or `@tigermail.auburn.edu` (Auth.js `signIn` callback: `return profile.email.endsWith("@auburn.edu")`). *Stored so far: nothing durable.*
2. **Issue magic link.** Server generates a single-use, high-entropy token, stores **`hash(token)` + expiry** in a short-lived `verification_tokens` table (Auth.js does this for you), and sends the link via Resend from `mail.plainscourses.com` (SPF+DKIM+DMARC published). *Stored: token hash + expiry, and — transiently, only until step 4 — the target address needed to send the mail.*
3. **User clicks link** (within 15–60 min). Server validates the token, marks it used.
4. **Derive durable identity, discard the address.** Compute `identity_hash = HMAC_SHA256(PEPPER, normalize(email))`. Upsert into `identities(identity_hash, verified_at)`. **Delete/never-persist the plaintext email** beyond this point. Establish a session cookie carrying an opaque session id (mapped server-side to `identity_hash`), *not* the email or the hash. *Stored: `identity_hash` + `verified_at`. No plaintext email anywhere.*
5. **User writes a review.** Insert `reviews(id, identity_hash, course_id, instructor, hours_per_week, difficulty, body, created_at)`. The **unique index `(identity_hash, course_id)`** rejects a second review for the same course by the same identity. *Stored: the review, keyed to the non-reversible `identity_hash`.*
6. **Public display.** The API serializing reviews **omits `identity_hash` entirely**; reviews render with no user handle (or an optional per-review random display id). `identity_hash` never crosses to the client. *Exposed publicly: review content only, no identity.*
7. **Edit/delete own review.** The logged-in user's session → `identity_hash` → find the row via `(identity_hash, course_id)`; update or delete. Works without ever re-touching the email.
8. **Subpoena / breach posture.** A dump of the database yields `identity_hash` values that are **not** brute-forceable back to addresses without `PEPPER` (held elsewhere). A "produce the database" order therefore doesn't de-anonymize reviewers. A targeted order compelling `PEPPER` *and* naming a suspected address can still confirm whether that address wrote a given review — the deliberate, documented residual that the legal research must weigh. There is no stored email to produce.

### Summary of stored state

| Store | Contents | Reversible to an email? |
|---|---|---|
| `verification_tokens` (ephemeral) | token hash, expiry, transient target address until send | address present only transiently; purge after use |
| `identities` | `identity_hash` (HMAC), `verified_at` | No, without the out-of-DB pepper |
| `reviews` | content + `identity_hash` + `(identity_hash, course_id)` unique | No, without the pepper |
| Public API payload | review content only | No |
| Secret manager (not DB) | `PEPPER`, `RESEND_API_KEY` | — |

---

## Open items to confirm (marked uncertain above)

- Exact current Auburn username format / digit count and whether it's fully enumerable (affects how hard we must lean on the pepper) — confirm on a live Auburn OIT account page.
- Alumni email retention specifics: grace period, whether the address changes at graduation, deletion policy — Auburn IT portal KB0011897 / KB0012546 render via JS and weren't fetchable as text; confirm the bodies directly or via Auburn IT.
- AWS SES: whether any standing free monthly send allowance still exists — the current pricing page shows only the $200 credit model; verify before relying on "free SES."
