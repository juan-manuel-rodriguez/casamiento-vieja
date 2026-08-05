/**
 * The venue's tables, taken from the floor plan: nine tables for 80 seats,
 * laid out in three sectors. The sector labels are the capacities printed on
 * the plan, and they add up to the tables inside them (8+8+10, 10+12, 8×4).
 *
 * `number` is what gets written next to a guest in the sheet, so these must
 * stay stable — renumbering tables would silently reseat everyone.
 */
export type VenueTable = {
  number: number;
  seats: number;
  zone: string;
};

export const VENUE_TABLES: VenueTable[] = [
  { number: 1, seats: 8, zone: "Sector 26" },
  { number: 2, seats: 8, zone: "Sector 26" },
  { number: 3, seats: 10, zone: "Sector 26" },
  { number: 4, seats: 10, zone: "Sector 22" },
  { number: 5, seats: 12, zone: "Sector 22" },
  { number: 6, seats: 8, zone: "Sector 32" },
  { number: 7, seats: 8, zone: "Sector 32" },
  { number: 8, seats: 8, zone: "Sector 32" },
  { number: 9, seats: 8, zone: "Sector 32" },
];

export const TOTAL_TABLES = VENUE_TABLES.length;

export const TOTAL_SEATS = VENUE_TABLES.reduce((sum, table) => sum + table.seats, 0);

/** Sector name to its tables, in plan order. */
export function tablesByZone(): Array<{ zone: string; tables: VenueTable[] }> {
  const zones: Array<{ zone: string; tables: VenueTable[] }> = [];
  for (const table of VENUE_TABLES) {
    const current = zones[zones.length - 1];
    if (current && current.zone === table.zone) current.tables.push(table);
    else zones.push({ zone: table.zone, tables: [table] });
  }
  return zones;
}

/** The stored value is the table number as text; "" means unseated. */
export function findTable(value: string): VenueTable | undefined {
  const number = Number(value);
  return VENUE_TABLES.find((table) => table.number === number);
}

export function tableLabel(value: string): string {
  if (!value) return "Sin mesa";
  const table = findTable(value);
  return table ? `Mesa ${table.number} · ${table.seats}` : value;
}
