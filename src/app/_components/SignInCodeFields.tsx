"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
// Deep `@/domain/email` import on purpose: the `@/domain` barrel pulls in
// `node:crypto` (anonymity.ts) and can't be bundled into a client component.
// This is the SAME domain check the send action and the exchange enforce.
import {
  AUBURN_DOMAIN,
  isAuburnStudentEmail,
  isUsernameOnly,
  resolveTypedUsername,
} from "@/domain/email";
import {
  requestSignInCode,
  type SignInFormState,
} from "@/app/signin/actions";

// The email + sign-in-code block (issue #47) — ONE client component used by
// both `/signin` and the review form, so there is exactly one code path for the
// Auburn-domain gate, the rate-limit and send copy, and the error copy. It
// renders the fields and the "Send code" control; the ENCLOSING form owns the
// submit (Sign in / Post) that hands `email` + `code` to an action which calls
// `exchangeCodeForSession`. Sending never navigates: "Send code" dispatches the
// rate-limit-gated `requestSignInCode` action from a plain button, so the
// address, the draft around it, and the notice all stay on screen.
//
// The address on screen is the user's own live input — the server never echoes
// it back (v1-spec §7).
//
// The domain is not typed (omscentral pattern, owner review 2026-08-17): the
// user enters only their username, and `@auburn.edu` sits beside the field as
// a fixed, static suffix (the one accepted domain — see AUBURN_DOMAIN). The
// full address is assembled here and posted through a hidden `email` field.
// "Send code" is not shown at all until something is typed; once it is, any
// username makes a valid Auburn address.

/** Minimum wait before "Resend code" re-enables. The real cap is the server's
 * send rate limit; this just stops an impatient double-tap. */
export const RESEND_DELAY_MS = 30_000;

/** Turn a sign-in-code error code into user copy. `Verification` is the ONE
 * message for wrong / expired / exhausted codes (issue #43: indistinguishable
 * from outside) — both the exchange and the Auth.js `?error=` fallback use it. */
export function signInErrorMessage(code: string): string {
  switch (code) {
    case "domain":
    case "AccessDenied":
      return "That address isn't an Auburn student address. Use your @auburn.edu email.";
    case "rate":
      return "Too many sign-in requests. Please wait an hour and try again.";
    case "Verification":
      return "That code is invalid or has expired — request a new one.";
    default:
      return "Something went wrong sending your code. Please try again in a moment.";
  }
}

/** Digits only: "123 456" and "123456" are the same code. */
export function codeDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export interface SignInCodeFieldsProps {
  /** An error from the exchange step (or the auth routes' `?error=`), shown by
   * the code field. Send-step errors are the component's own. */
  errorCode?: string | null;
  /** A code was already sent before this mounted (the Auth.js verify-request
   * redirect fallback on `/signin`), so open in the sent state. */
  initialSent?: boolean;
  /** Fires with the digits typed so far; the enclosing form gates its submit
   * on six of them. */
  onCodeChange?: (digits: string) => void;
  autoFocusEmail?: boolean;
}

// The client-side view of a send: the server's outcome plus WHEN it landed, so
// the resend cooldown can count from it without a clock round trip.
type SendState = SignInFormState & { sentAt?: number };

const IDLE: SendState = { status: "idle" };

export default function SignInCodeFields({
  errorCode = null,
  initialSent = false,
  onCodeChange,
  autoFocusEmail = false,
}: SignInCodeFieldsProps) {
  const [local, setLocal] = useState("");
  const [code, setCode] = useState("");
  // The assembled address — what is posted and what the send action gets.
  // Empty until the field holds a bare username: a half-typed "abc@tiger…"
  // must never be joined to the suffix (see isUsernameOnly).
  const usernameOnly = isUsernameOnly(local);
  const email = usernameOnly ? `${local.trim()}@${AUBURN_DOMAIN}` : "";
  const [now, setNow] = useState(() => Date.now());

  const [sendState, sendAction, sendPending] = useActionState<SendState, FormData>(
    async (prev, formData) => {
      const next = await requestSignInCode(prev, formData);
      return next.status === "sent" ? { ...next, sentAt: Date.now() } : next;
    },
    initialSent ? { status: "sent" } : IDLE,
  );

  const sent = sendState.status === "sent";
  const resendAt = sendState.sentAt ? sendState.sentAt + RESEND_DELAY_MS : null;
  const cooling = resendAt !== null && now < resendAt;

  // Tick once a second only while the cooldown is running, so the "Resend in
  // Ns" label counts down; idle otherwise.
  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooling]);

  // The button exists only once something is typed; a bare username + our
  // fixed suffix is always a valid Auburn address, so it is live unless the
  // field holds an "@" (mid-paste / mid-type), a send is in flight, or the
  // resend cooldown is running.
  const showSend = local.trim() !== "";
  const canSend = isAuburnStudentEmail(email) && !sendPending && !cooling;

  const send = () => {
    if (!canSend) return;
    const formData = new FormData();
    formData.set("email", email);
    // A useActionState dispatcher must run inside a transition when it isn't
    // wired to a form submit; this keeps "Send code" a plain button so it can
    // never become the enclosing form's implicit-submit target.
    startTransition(() => sendAction(formData));
  };

  const sendLabel = sendPending
    ? "Sending…"
    : !sent
      ? "Send code"
      : cooling
        ? `Resend in ${Math.ceil((resendAt! - now) / 1000)}s`
        : "Resend code";

  return (
    <div className="code-fields">
      <div>
        <label htmlFor="signin-username" className="field-label">
          Auburn email
        </label>
        <div className="code-row">
          <div className="email-group">
            <input
              id="signin-username"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={autoFocusEmail}
              placeholder="abc1234"
              className="num-input email-local"
              aria-describedby="signin-email-domain"
              value={local}
              // A pasted or autofilled FULL @auburn.edu address is reduced to
              // its username; anything else is kept exactly as typed.
              onChange={(e) => setLocal(resolveTypedUsername(e.target.value))}
              // Enter in the address field means "send me the code," not "submit
              // the form around me" (which would post an empty code / draft).
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <span id="signin-email-domain" className="email-domain">
              @{AUBURN_DOMAIN}
            </span>
          </div>
          {/* The enclosing form posts the assembled address, never the parts. */}
          <input type="hidden" name="email" value={email} />
          {showSend && (
            <button
              type="button"
              className="btn-send"
              disabled={!canSend}
              onClick={send}
            >
              {sendLabel}
            </button>
          )}
        </div>
        {showSend && !usernameOnly && (
          <p className="code-hint">
            Just your username — the Auburn domain is filled in on the right.
          </p>
        )}
        {sendState.status === "error" && (
          <p role="alert" className="code-alert error">
            {signInErrorMessage(sendState.reason)}
          </p>
        )}
        {sent && (
          <p role="status" className="code-alert ok">
            Code sent! Check your inbox, and your Junk folder. It expires in about 10 minutes.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="signin-code" className="field-label">
          6-digit code
        </label>
        <input
          id="signin-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123 456"
          className="num-input code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            onCodeChange?.(codeDigits(e.target.value));
          }}
        />
        {errorCode && (
          <p role="alert" className="code-alert error">
            {signInErrorMessage(errorCode)}
          </p>
        )}
      </div>
    </div>
  );
}
