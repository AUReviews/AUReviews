"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { clientIpFromHeaders } from "@/auth/client-ip";
import { getPepper } from "@/auth/pepper";
import { checkAndRecordSend } from "@/auth/rate-limit";
import {
  computeIdentityHash,
  isAuburnStudentEmail,
  normalizeEmail,
} from "@/domain";

/** Result surfaced to the combined sign-in form (issue #43). `reason` values
 * map to user-facing copy in the form component; "Verification" matches the
 * error code Auth.js itself redirects with, so the copy map covers both. */
export type SignInFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; reason: "domain" | "rate" | "send" | "Verification" };

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

// Server action: exchange the typed code for a session. Normalizes the form
// input, then hands off to the provider's standard email-callback route, which
// consumes the token and establishes the session (issue #43: no hand-rolled
// exchange endpoint — a decision #47 supersedes: the exchange moves into a
// server-only module so this form and the review form can verify without
// navigating). Deliberately no domain or existence checks here — every
// failed exchange resolves to the one generic "invalid or expired" message
// (issue #43: wrong, expired, and exhausted are indistinguishable).
export async function verifyCode(
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const email = emailFromForm(formData);
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    return { status: "error", reason: "Verification" };
  }

  redirect(
    `/api/auth/callback/resend?${new URLSearchParams({
      email,
      token: code,
      callbackUrl: "/",
    })}`,
  );
}
