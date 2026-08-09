/**
 * On-demand revalidation, the framework-free core (v1-spec §8).
 *
 * Later writes (review submit/edit/delete/takedown, catalog imports) call the
 * internal `/api/revalidate` endpoint to refresh the affected ISR pages while
 * reads stay CDN-served. This module does the auth + input validation so it is
 * unit-testable without the Next runtime; the route turns the returned plan into
 * actual `revalidateTag` / `revalidatePath` calls. Nothing calls it yet — the
 * seam simply exists, as the ticket requires.
 */
export interface RevalidateRequestBody {
  tag?: unknown;
  path?: unknown;
}

export type RevalidatePlan =
  | { ok: true; status: 200; tags: string[]; paths: string[] }
  | { ok: false; status: 401 | 400; error: string };

/**
 * Validate a revalidation request against the shared secret and return a plan
 * of what to revalidate. Rejects (401) when the secret is missing or the bearer
 * token does not match; rejects (400) on malformed or empty targets.
 */
export function parseRevalidateRequest(
  authorization: string | null,
  body: RevalidateRequestBody | null,
  expectedSecret: string | undefined,
): RevalidatePlan {
  if (!expectedSecret) {
    return {
      ok: false,
      status: 401,
      error: "Revalidation secret is not configured on the server.",
    };
  }

  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!token || token !== expectedSecret) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const tags: string[] = [];
  const paths: string[] = [];

  if (body?.tag !== undefined) {
    if (typeof body.tag !== "string" || body.tag.length === 0) {
      return { ok: false, status: 400, error: "`tag` must be a non-empty string." };
    }
    tags.push(body.tag);
  }

  if (body?.path !== undefined) {
    if (typeof body.path !== "string" || !body.path.startsWith("/")) {
      return {
        ok: false,
        status: 400,
        error: "`path` must be a string starting with `/`.",
      };
    }
    paths.push(body.path);
  }

  if (tags.length === 0 && paths.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Provide at least one of `tag` or `path` to revalidate.",
    };
  }

  return { ok: true, status: 200, tags, paths };
}
