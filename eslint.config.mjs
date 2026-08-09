import next from "eslint-config-next";
import importPlugin from "eslint-plugin-import";

/**
 * Flat ESLint config.
 *
 * The load-bearing rule here is the catalog/review seam boundary (ADR 0002,
 * v1-spec §8): the `ingest/` module may import the domain layer, but the domain
 * layer must NEVER import `ingest/` (nor `db/`, nor `app/`, nor any framework).
 * The domain stays a pure, dependency-light core. This direction is also
 * covered by a runtime test (src/domain/boundary.test.ts) so it holds in CI
 * even where the lint step is skipped.
 */
const config = [
  ...next,
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    plugins: { import: importPlugin },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/domain",
              from: "./src/ingest",
              message:
                "Domain must not import ingest — the seam is one-way (ingest -> domain). See ADR 0002.",
            },
            {
              target: "./src/domain",
              from: "./src/db",
              message: "Domain must stay persistence-agnostic — no db/ imports.",
            },
            {
              target: "./src/domain",
              from: "./src/app",
              message: "Domain must not import framework/app code.",
            },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-dom",
                "drizzle-orm",
                "drizzle-orm/*",
                "@neondatabase/*",
              ],
              message:
                "The domain layer must stay pure — no framework or DB imports.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
