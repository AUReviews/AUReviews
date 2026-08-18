"use client";

import { useActionState, useState } from "react";
import SignInCodeFields from "@/app/_components/SignInCodeFields";
import { verifyCode, type SignInFormState } from "./actions";

const IDLE: SignInFormState = { status: "idle" };

// The standalone sign-in form (issues #43/#47, omscentral pattern): the shared
// email + code block, then one "Sign in" submit that runs the same in-process
// exchange the review form's Post uses. Nothing here navigates on failure —
// the exchange returns state, so a wrong code no longer remounts the form or
// asks for the address again (the #46 trade-off is gone).
export function SignInForm({
  initialErrorCode,
  initialSent,
}: {
  initialErrorCode: string | null;
  initialSent: boolean;
}) {
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyCode,
    IDLE,
  );
  const [digits, setDigits] = useState("");

  // A verify error is the most recent user-visible outcome; otherwise whatever
  // error the auth routes redirected here with (?error=...).
  const errorCode =
    verifyState.status === "error" ? verifyState.reason : initialErrorCode;

  return (
    <form action={verifyAction} className="signin-form" noValidate>
      <SignInCodeFields
        errorCode={errorCode}
        initialSent={initialSent}
        onCodeChange={setDigits}
        autoFocusEmail
      />
      <button
        type="submit"
        className="btn-post btn-block"
        disabled={verifyPending || digits.length !== 6}
      >
        {verifyPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
