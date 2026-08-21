/**
 * The site's public origin for links that leave the app (operator emails,
 * issue #27). Prefers the explicit deployment origin (`AUREVIEWS_BASE_URL`,
 * the same variable the catalog-refresh script uses), then Auth.js's
 * `AUTH_URL`, then whatever the request's forwarded host says — so a preview
 * deployment links to itself, and a local run to localhost.
 */
export function siteOrigin(
  request: { host: string | null; proto: string | null },
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.AUREVIEWS_BASE_URL?.trim() || env.AUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (request.host) {
    const proto = request.proto ?? (request.host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${request.host}`;
  }
  return "https://aureviews.com";
}
