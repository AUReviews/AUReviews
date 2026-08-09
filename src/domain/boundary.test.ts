import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces the one-way catalog/review seam (ADR 0002, v1-spec §8): the domain
 * layer must NEVER import from `ingest/`, `db/`, or `app/`, nor from any
 * framework/DB package. `ingest` importing `domain` is allowed; the reverse is
 * not. This runtime check backs the eslint `import/no-restricted-paths` rule so
 * the direction holds in CI regardless of whether the lint step runs.
 */
const DOMAIN_DIR = join(process.cwd(), "src", "domain");

const FORBIDDEN_SPECIFIERS = [
  /^\.\.\/ingest(\/|$)/,
  /^\.\.\/db(\/|$)/,
  /^\.\.\/app(\/|$)/,
  /^@\/ingest(\/|$)/,
  /^@\/db(\/|$)/,
  /^@\/app(\/|$)/,
  /^next(\/|$)/,
  /^react(-dom)?(\/|$)/,
  /^drizzle-orm(\/|$)/,
  /^@neondatabase\//,
];

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

function domainSourceFiles(): string[] {
  return readdirSync(DOMAIN_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(DOMAIN_DIR, f));
}

describe("domain layer boundary", () => {
  it("has domain source files to check", () => {
    expect(domainSourceFiles().length).toBeGreaterThan(0);
  });

  it("never imports from ingest/db/app or any framework/DB package", () => {
    const violations: string[] = [];

    for (const file of domainSourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT_RE)) {
        const specifier = match[1];
        if (FORBIDDEN_SPECIFIERS.some((re) => re.test(specifier))) {
          violations.push(`${file} imports "${specifier}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
