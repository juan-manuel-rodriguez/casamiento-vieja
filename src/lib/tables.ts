/**
 * Tables the venue gives us. `count` tables of `seats` seats each — the salon
 * quoted 6 de 8, 2 de 10 y una de 12.
 */
export type TableSpec = {
  seats: number;
  count: number;
};

export const VENUE_TABLES: TableSpec[] = [
  { seats: 8, count: 6 },
  { seats: 10, count: 2 },
  { seats: 12, count: 1 },
];

export const TOTAL_TABLES = VENUE_TABLES.reduce((sum, spec) => sum + spec.count, 0);

export const TOTAL_SEATS = VENUE_TABLES.reduce(
  (sum, spec) => sum + spec.count * spec.seats,
  0,
);

/** One entry per physical table, numbered, for laying groups out one by one. */
export function listTables(): Array<{ number: number; seats: number }> {
  const tables: Array<{ number: number; seats: number }> = [];
  for (const spec of VENUE_TABLES) {
    for (let i = 0; i < spec.count; i++) {
      tables.push({ number: tables.length + 1, seats: spec.seats });
    }
  }
  return tables;
}
