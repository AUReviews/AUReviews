import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Runtime database client. The app and Auth.js connect to Neon over the
 * POOLED endpoint (v1-spec §8) — `DATABASE_URL`, whose host contains
 * `-pooler`. Migrations use the DIRECT endpoint (`DATABASE_URL_UNPOOLED`) via drizzle-kit
 * and never go through this client.
 *
 * The client is created lazily so that merely importing this module during the
 * build (where env vars may be absent) never throws — only an actual query does.
 */
function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The app connects to Neon over the POOLED endpoint. " +
        "See docs/deploy.md.",
    );
  }
  return url;
}

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!cached) {
    cached = drizzle(neon(connectionString()), { schema });
  }
  return cached;
}
