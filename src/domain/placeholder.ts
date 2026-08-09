/**
 * Walking-skeleton proof-of-life value (v1-spec §8).
 *
 * The deployed page reads the newest `PlaceholderRow` from Postgres and renders
 * it, proving hosting → app → DB → cache is wired end to end. This is
 * scaffolding: the real catalog/review reads (#18, #6) replace it. Kept in the
 * domain layer only so the skeleton page has a pure formatter to test against.
 */
export interface PlaceholderRow {
  id: number;
  message: string;
  createdAt: Date;
}

/** Render a placeholder row as the single line the skeleton page shows. Pure. */
export function formatPlaceholder(row: PlaceholderRow): string {
  return `${row.message} (seeded ${row.createdAt.toISOString()})`;
}
