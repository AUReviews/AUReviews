/**
 * One-time skeleton seed: insert a single placeholder row so the deployed page
 * has real DB data to render (v1-spec §8 acceptance: "not hardcoded").
 *
 * Run locally against the pooled endpoint:  npm run db:seed
 * (loads .env.local via tsx). Idempotent — does nothing if a row already exists.
 */
import { getDb } from "./client";
import { placeholder } from "./schema";

// Load .env.local for local runs (Node 24 built-in). On CI/Vercel the file is
// absent and the vars are injected directly, so a missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — rely on the ambient environment.
}

async function main(): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(placeholder).limit(1);
  if (existing.length > 0) {
    console.log("placeholder already seeded — nothing to do.");
    return;
  }
  await db.insert(placeholder).values({
    message:
      "AUReviews walking skeleton is live — this line was read from Neon Postgres.",
  });
  console.log("Seeded one placeholder row.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
