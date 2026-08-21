"use server";

import { validateConcern } from "@/domain";
import { insertConcern } from "@/db/queries";
import { buildConcernEmail, sendOperatorEmail } from "@/lib/operator-mail";

/**
 * The concern form's state (issue #27). `sent` is the success screen; an
 * `error` carries the one field the reader needs to fix.
 */
export type ConcernFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; field: "kind" | "message" | "contactEmail" | "form"; message: string };

/**
 * "Report a concern" (v1-spec §11/§12/§13; issue #27): the UNGATED, site-wide
 * form. No session is read and no `@auburn.edu` check runs — a visitor
 * spotting a bug shouldn't have to prove enrollment. Writes a `concerns` row
 * and emails the operator (the row is the record, the email the push). The
 * `website` field is a honeypot: real readers never see it, so a filled value
 * is a bot and is silently dropped as if sent.
 */
export async function submitConcern(
  _prev: ConcernFormState,
  formData: FormData,
): Promise<ConcernFormState> {
  if (str(formData.get("website"))) return { status: "sent" };

  const validated = validateConcern({
    kind: str(formData.get("kind")),
    message: str(formData.get("message")),
    contactEmail: str(formData.get("contactEmail")),
    pageUrl: str(formData.get("pageUrl")),
  });
  if (!validated.ok) {
    return { status: "error", field: validated.field, message: validated.message };
  }

  const concernId = await insertConcern({
    kind: validated.kind,
    message: validated.message,
    contactEmail: validated.contactEmail,
    pageUrl: validated.pageUrl,
  });
  await sendOperatorEmail(
    buildConcernEmail({
      concernId,
      kind: validated.kind,
      message: validated.message,
      contactEmail: validated.contactEmail,
      pageUrl: validated.pageUrl,
    }),
  );
  return { status: "sent" };
}

function str(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" ? v : null;
}
