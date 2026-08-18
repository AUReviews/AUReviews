"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { clientIpFromHeaders } from "@/auth/client-ip";
import { exchangeCodeForSession, type ExchangeFailure } from "@/auth/exchange";
import { getPepper } from "@/auth/pepper";
import { checkAndRecordSend } from "@/auth/rate-limit";
import {
  computeIdentityHash,
  isAuburnStudentEmail,
  normalizeEmail,
} from "@/domain";

/** Result surfaced to the sign-in code fields (issues #43/#47). `reason`
 * values map to user-facing copy in the shared `SignInCodeFields` component;
 * "Verification" matches the error code Auth.js itself redirects with, so the
 * copy map covers both. */
export type SignInFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; reason: ExchangeFailure | "rate" | "send" };

function emailFromForm(formData: FormData): string {
  return normalizeEmail(String(formData.get("email") ?? ""));
}

// Server action: the "Send code" entry point and the enforced send gate.
//   1. Domain is checked here for a friendly inline message AND again in the
//      signIn callback as the security gate (v1-spec §7) — an invalid address is
//      rejected before any email is sent.
//   2. Send rate limits (≤3/address/hr, ≤10/IP/hr, <100/day) are enforced HERE,
//      before signIn issues a token — so a throttled request never rotates an
//      existing live code.
export async function requestSignInCode(
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const email = emailFromForm(formData);
  if (!isAuburnStudentEmail(email)) {
    return { status: "error", reason: "domain" };
  }

  const addressHash = computeIdentityHash(getPepper(), email);
  const ip = clientIpFromHeaders(await headers());
  const decision = await checkAndRecordSend({ addressHash, ip });
  if (!decision.allowed) {
    return { status: "error", reason: "rate" };
  }

  // redirect: false — the form stays on screen with the address still typed in,
  // so the user can enter the code the moment it arrives.
  try {
    // signIn hands back a URL instead of redirecting: the verify-request URL on
    // success, or an error-page URL (?error=...) if Auth.js rejected the
    // request. Delivery failures (Resend down, missing key) throw instead.
    const result = await signIn("resend", {
      email,
      redirectTo: "/",
      redirect: false,
    });
    if (typeof result === "string" && result.includes("error=")) {
      return { status: "error", reason: "send" };
    }
  } catch {
    return { status: "error", reason: "send" };
  }
  return { status: "sent" };
}

// Server action: exchange the typed code for a session, in-process (issue #47,
// ADR 0003). `exchangeCodeForSession` is the ONE exchange path — the review
// form's Post action calls the same module — so it, not this action, owns the
// domain check, the Auth.js token hash, single use, and the attempt cap. A
// failure comes back as state, never a navigation: the form stays mounted with
// the address still typed in, and every failed exchange resolves to the one
// generic "invalid or expired" message (issue #43: wrong, expired, and
// exhausted are indistinguishable). Only success navigates.
export async function verifyCode(
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = await exchangeCodeForSession({
    email: emailFromForm(formData),
    code: String(formData.get("code") ?? ""),
  });
  if (!result.ok) {
    return { status: "error", reason: result.reason };
  }
  redirect("/");
}
