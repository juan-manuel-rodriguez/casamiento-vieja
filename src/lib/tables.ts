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

/**
 * Where each table sits on the floor plan, in the SVG coordinate space below.
 * Taken from the venue's plan: two rows of rectangular tables up top, the two
 * long ones in the middle, and the four eights stacked along the right.
 */
export const PLAN_VIEWBOX = { width: 300, height: 800 };

export type TablePlacement = {
  number: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const TABLE_PLACEMENTS: TablePlacement[] = [
  { number: 1, x: 40, y: 30, width: 86, height: 36 },
  { number: 2, x: 178, y: 76, width: 86, height: 36 },
  { number: 3, x: 100, y: 170, width: 36, height: 104 },
  { number: 4, x: 44, y: 330, width: 36, height: 104 },
  { number: 5, x: 158, y: 320, width: 36, height: 124 },
  { number: 6, x: 170, y: 500, width: 86, height: 36 },
  { number: 7, x: 170, y: 578, width: 86, height: 36 },
  { number: 8, x: 170, y: 656, width: 86, height: 36 },
  { number: 9, x: 170, y: 734, width: 86, height: 36 },
];

/**
 * Chairs around a table, drawn the way the plan does it: the long sides carry
 * (seats - 2) / 2 chairs each and one sits at either end. Every table here has
 * an even seat count of 8, 10 or 12, so that divides cleanly.
 */
export function seatPositions(placement: TablePlacement, seats: number): Array<{ x: number; y: number }> {
  const gap = 11;
  const horizontal = placement.width > placement.height;
  const perSide = (seats - 2) / 2;
  const positions: Array<{ x: number; y: number }> = [];

  const along = horizontal ? placement.width : placement.height;
  for (let i = 0; i < perSide; i++) {
    const offset = (along * (i + 1)) / (perSide + 1);
    if (horizontal) {
      positions.push({ x: placement.x + offset, y: placement.y - gap });
      positions.push({ x: placement.x + offset, y: placement.y + placement.height + gap });
    } else {
      positions.push({ x: placement.x - gap, y: placement.y + offset });
      positions.push({ x: placement.x + placement.width + gap, y: placement.y + offset });
    }
  }

  const midX = placement.x + placement.width / 2;
  const midY = placement.y + placement.height / 2;
  if (horizontal) {
    positions.push({ x: placement.x - gap, y: midY });
    positions.push({ x: placement.x + placement.width + gap, y: midY });
  } else {
    positions.push({ x: midX, y: placement.y - gap });
    positions.push({ x: midX, y: placement.y + placement.height + gap });
  }

  return positions;
}
