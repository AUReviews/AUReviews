/**
 * The site's public origin for links that leave the app (operator emails,
 * issue #27). The request's forwarded host wins, so a preview deployment or
 * a local run links to itself; the configured deployment origin
 * (`AUREVIEWS_BASE_URL`, the variable the catalog-refresh script uses, then
 * Auth.js's `AUTH_URL`) is the fallback when no host is known.
 */
export function siteOrigin(
  request: { host: string | null; proto: string | null },
  env: Record<string, string | undefined> = process.env,
): string {
  if (request.host) {
    const proto = request.proto ?? (request.host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${request.host}`;
  }
  const configured = env.AUREVIEWS_BASE_URL?.trim() || env.AUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://aureviews.com";
}
