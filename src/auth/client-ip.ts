/**
 * Best-effort client IP for the per-IP send throttle (v1-spec §7). Behind
 * Vercel/Neon the client hop is the first entry of `x-forwarded-for`. This is a
 * coarse throttle against enumeration, not an identity — a stable `"unknown"`
 * sentinel is fine when no proxy header is present (it just shares one bucket).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
