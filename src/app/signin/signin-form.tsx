"use client";

import { useActionState } from "react";
import {
  requestSignInCode,
  verifyCode,
  type SignInFormState,
} from "./actions";

const IDLE: SignInFormState = { status: "idle" };

// One combined form (issue #43, omscentral pattern): email with "Send code",
// code with "Sign in", both always visible. The address on screen is the
// user's own live input — the server never echoes it back (v1-spec §7).
function errorMessage(code: string): string {
  switch (code) {
    case "domain":
    case "AccessDenied":
      return "That address isn't an Auburn student address. Use your @auburn.edu or @tigermail.auburn.edu email.";
    case "rate":
      return "Too many sign-in requests. Please wait an hour and try again.";
    case "Verification":
      return "That code is invalid or has expired — request a new one.";
    default:
      return "Something went wrong sending your code. Please try again in a moment.";
  }
}

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  fontSize: "1rem",
  border: "1px solid #ccc",
  borderRadius: 6,
  boxSizing: "border-box",
} as const;

const buttonStyle = {
  marginTop: "0.75rem",
  width: "100%",
  padding: "0.65rem 1rem",
  fontSize: "1rem",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
} as const;

const labelStyle = {
  display: "block",
  fontSize: "0.85rem",
  marginBottom: 6,
} as const;

export function SignInForm({
  initialErrorCode,
  initialSent,
}: {
  initialErrorCode: string | null;
  initialSent: boolean;
}) {
  const [sendState, sendAction, sendPending] = useActionState(
    requestSignInCode,
    IDLE,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyCode,
    IDLE,
  );

  // A verify error is the most recent user-visible outcome; then a send error;
  // then whatever error the auth routes redirected here with (?error=...).
  const errorCode =
    verifyState.status === "error"
      ? verifyState.reason
      : sendState.status === "error"
        ? sendState.reason
        : initialErrorCode;
  // initialSent covers the Auth.js verify-request redirect (a code was sent
  // before this page loaded); it yields to any in-page send outcome.
  const sent =
    sendState.status === "sent" ||
    (initialSent && sendState.status === "idle");

  return (
    <>
      {errorCode && (
        <p
          role="alert"
          style={{
            margin: "1rem 0",
            padding: "0.75rem 1rem",
            background: "#fbeaea",
            color: "#b00",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          {errorMessage(errorCode)}
        </p>
      )}

      {sent && (
        <p
          role="status"
          style={{
            margin: "1rem 0",
            padding: "0.75rem 1rem",
            background: "#e8f6f0",
            color: "#065",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          If that address is a valid Auburn student address, a 6-digit code is
          on its way. It expires in about 10 minutes. Auburn mail is filtered
          by Microsoft 365 — check your Junk folder if you don&apos;t see it,
          then enter the code below.
        </p>
      )}

      <form style={{ margin: "1.5rem 0" }}>
        <label htmlFor="email" style={labelStyle}>
          Auburn email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="abc1234@auburn.edu"
          style={inputStyle}
        />
        <button
          type="submit"
          formAction={sendAction}
          disabled={sendPending}
          style={{
            ...buttonStyle,
            background: "#eef1f0",
            color: "#0a7",
            border: "1px solid #0a7",
          }}
        >
          {sendPending ? "Sending…" : "Send code"}
        </button>

        <label htmlFor="code" style={{ ...labelStyle, marginTop: "1.25rem" }}>
          6-digit code
        </label>
        {/* Not `required`: browser validation must not block the "Send code"
            submit, which shares this form. The server enforces the 6-digit
            shape; `pattern` still validates any non-empty value. */}
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          title="The 6-digit code from your email"
          placeholder="123 456"
          style={inputStyle}
        />
        <button
          type="submit"
          formAction={verifyAction}
          disabled={verifyPending}
          style={{ ...buttonStyle, background: "#0a7", color: "#fff" }}
        >
          {verifyPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
