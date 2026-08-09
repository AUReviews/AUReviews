import { defineConfig } from "drizzle-kit";

// Load .env.local for local runs (Node 24 built-in). On Vercel/CI the file is
// absent and the platform injects the vars directly, so a missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — rely on the ambient environment (Vercel/CI/exported vars).
}

// Migrations run against the DIRECT (non-pooled) Neon endpoint — see §8 of
// docs/v1-spec.md. The application/Auth.js path uses the POOLED endpoint
// (DATABASE_URL) at runtime; schema changes must not go through PgBouncer.
const databaseUrlUnpooled = process.env.DATABASE_URL_UNPOOLED;

if (!databaseUrlUnpooled) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. Migrations use the Neon *direct* (non-pooled) endpoint. " +
      "Copy .env.example to .env.local and fill it in (see docs/deploy.md).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrlUnpooled },
  strict: true,
  verbose: true,
});
